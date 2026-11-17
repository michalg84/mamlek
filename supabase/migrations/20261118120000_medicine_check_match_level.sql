-- Substance match level: the medicine check — substance-match-level, phase 1 (rule part).
--
-- public.medicine_check gets a match level, p_level, for the `substance` comparison. Both paths (the common-name part
-- set and the substance set) use the operator of the level:
--   exact  the kit item's set equals the searched set (the rule until now, the default);
--   all    the kit item's set contains the whole searched set (kit @> searched);
--   any    the sets share at least one element (kit && searched).
-- The results are monotonic: exact ⊆ all ⊆ any. The searched set must be non-empty on every level: `x @> '{}'` is
-- always true, so a generic placeholder in the searched product would otherwise match the whole kit.
--
-- Every match gets a strength (match_strength, as `strength` is the medicine's strength column): 0 variant, 1 equal
-- set, 2 superset, 3 overlap, the smallest one over the paths that passed. Items are ordered by strength, then by
-- expiry (unknown last), newest first; on `exact` that is the order of
-- 20261117120100_variant_key_btrim_medicine_check.sql. matchedBy is the path with the smallest strength, common_name
-- on a tie (as before). The answer echoes the level in a new `level` field; the item shape is unchanged. A level
-- outside exact | all | any raises 22023 (invalid_parameter_value) instead of returning a silent result.
--
-- The body is the one from 20261117120100_variant_key_btrim_medicine_check.sql (S-12, kit-quantity-semantics, only
-- changed the comment of kit_items.quantity). CREATE OR REPLACE with another argument list would add an overload, so
-- the old function is dropped and the new one created with its revoke/grant repeated.
--
-- medicine_check_is_generic also treats "-" as a placeholder (the only real one outside the list, 2 products in the
-- 2026-11-16 registry). Its signature is unchanged, so CREATE OR REPLACE keeps its privileges. Only the medicine_check
-- set functions call it; the importer and the search list do not.
--
-- This migration reads kit_items, so it is NOT part of REGISTRY_MIGRATIONS (the scratch database of the registry
-- import test has no kit_items).
--
-- Deploy order: merge the PR first, THEN run `npx supabase db push` by hand. The service sends p_level only for a
-- level other than exact, and the parser reads a missing `level` as exact, so the merged code works on the old
-- database at the default level.
-- Rollback: drop function public.medicine_check(bigint, text); restore medicine_check(bigint) from
-- 20261117120100_variant_key_btrim_medicine_check.sql with revoke execute from public, anon and grant execute to
-- authenticated; restore medicine_check_is_generic from 20261010120000_medicine_check.sql.

create or replace function public.medicine_check_is_generic(p_value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    public.medicine_check_normalize(p_value) = any (array[
      'produkt złożony',
      'preparat złożony',
      'homeopatyczny produkt leczniczy',
      'preparat homeopatyczny',
      'preparat ziołowy',
      'produkt ziołowy',
      'produkt homeopatyczny',
      '-'
    ])
    or public.medicine_check_normalize(p_value) ~ '^(produkt|preparat) ',
    false
  )
$$;

comment on function public.medicine_check_is_generic(text) is
  'True when the normalized value is a generic registry placeholder (a listed one, "-" included, or any value starting with "produkt " or "preparat ") that must never produce a match.';

drop function public.medicine_check(bigint);

-- The searched sets come from p_product_id itself (the suggestion's representative), not from its
-- variant siblings. The product is not filtered by removed_at: the daily import can withdraw it
-- between page load and pick. Unknown id -> NULL. The variant key (btrim) matches the search list and
-- registry_variant_packages, but without their removed_at filters (withdrawn packs in the kit count).
create function public.medicine_check(p_product_id bigint, p_level text default 'exact')
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_level is null or p_level not in ('exact', 'all', 'any') then
    raise exception 'medicine_check: unknown match level %', coalesce(p_level, 'NULL')
      using errcode = '22023', hint = 'Use exact, all or any.';
  end if;

  return (
    with searched as (
      select
        p.id,
        p.name,
        p.strength,
        p.pharmaceutical_form,
        p.common_name,
        public.medicine_check_common_name_set(p.common_name) as common_name_set,
        public.medicine_check_substance_set(p.id) as substance_set
      from public.registry_products p
      where p.id = p_product_id
    ),
    kit as (
      select
        k.id,
        k.package_id,
        k.quantity,
        k.expires_on,
        k.expiry_precision,
        k.created_at,
        pk.units,
        pk.removed_at is not null or p.removed_at is not null as withdrawn,
        p.id as product_id,
        p.name,
        p.strength,
        p.pharmaceutical_form,
        p.common_name,
        p.marketing_authorization_holder
      from public.kit_items k
      join public.registry_packages pk on pk.id = k.package_id
      join public.registry_products p on p.id = pk.product_id
    ),
    compared as (
      select
        kit.*,
        e.variant,
        -- Strength of each path on the requested level: 1 equal, 2 superset, 3 overlap, NULL no match.
        case
          when cardinality(s.common_name_set) = 0 then null
          when e.kit_common_name_set = s.common_name_set then 1
          when p_level in ('all', 'any') and e.kit_common_name_set @> s.common_name_set then 2
          when p_level = 'any' and e.kit_common_name_set && s.common_name_set then 3
        end as common_name_strength,
        case
          when cardinality(s.substance_set) = 0 then null
          when e.kit_substance_set = s.substance_set then 1
          when p_level in ('all', 'any') and e.kit_substance_set @> s.substance_set then 2
          when p_level = 'any' and e.kit_substance_set && s.substance_set then 3
        end as substances_strength
      from kit
      cross join searched s
      cross join lateral (
        select
          lower(btrim(kit.name)) = lower(btrim(s.name))
            and lower(btrim(coalesce(kit.strength, ''))) = lower(btrim(coalesce(s.strength, '')))
            and lower(btrim(coalesce(kit.pharmaceutical_form, ''))) = lower(btrim(coalesce(s.pharmaceutical_form, '')))
            as variant,
          public.medicine_check_common_name_set(kit.common_name) as kit_common_name_set,
          public.medicine_check_substance_set(kit.product_id) as kit_substance_set
      ) e
    ),
    matched as (
      select
        c.*,
        case when c.variant then 'variant' else 'substance' end as match,
        case
          when c.variant then null
          when c.common_name_strength <= coalesce(c.substances_strength, 4) then 'common_name'
          else 'substances'
        end as matched_by,
        case
          when c.variant then 0
          else least(c.common_name_strength, c.substances_strength)
        end as match_strength
      from compared c
      where c.variant or c.common_name_strength is not null or c.substances_strength is not null
    )
    select jsonb_build_object(
      'searched', jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'strength', s.strength,
        'form', s.pharmaceutical_form,
        'commonName', s.common_name,
        'substances', (
          select coalesce(jsonb_agg(ps.name order by ps.position), '[]'::jsonb)
          from public.registry_product_substances ps
          where ps.product_id = s.id
        )
      ),
      'level', p_level,
      'comparable', cardinality(s.common_name_set) > 0 or cardinality(s.substance_set) > 0,
      'items', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', m.id,
              'packageId', m.package_id,
              'match', m.match,
              'matchedBy', m.matched_by,
              'name', m.name,
              'strength', m.strength,
              'form', m.pharmaceutical_form,
              'holder', m.marketing_authorization_holder,
              'commonName', m.common_name,
              'substances', (
                select coalesce(jsonb_agg(ps.name order by ps.position), '[]'::jsonb)
                from public.registry_product_substances ps
                where ps.product_id = m.product_id
              ),
              'units', m.units,
              'quantity', m.quantity,
              'expiresOn', m.expires_on,
              'expiryPrecision', m.expiry_precision,
              'withdrawn', m.withdrawn,
              'createdAt', m.created_at
            )
            order by m.match_strength asc, m.expires_on asc nulls last, m.created_at desc, m.id desc
          ),
          '[]'::jsonb
        )
        from matched m
      )
    )
    from searched s
  );
end;
$$;

revoke execute on function public.medicine_check(bigint, text) from public, anon;
grant execute on function public.medicine_check(bigint, text) to authenticated;

comment on function public.medicine_check(bigint, text) is
  'Checks a registry product against the caller''s kit on a match level (exact: equal common-name or substance set, the default; all: the kit item''s set contains the searched one; any: the sets overlap; generic placeholders never match): the searched product (full strength, substances in position order), the level, whether it is comparable (non-empty common-name or substance set) and the matching kit items ordered by match strength (variant, equal set, superset, overlap), then by expiry (unknown last), newest first. A variant match uses the same key as the suggestion list and registry_variant_packages: lower(btrim()) of name, strength and pharmaceutical form. NULL for an unknown product; 22023 for an unknown level.';
