-- Variant key with btrim: the medicine check — variant-key-btrim, phase 1 (rule part).
--
-- public.medicine_check compares the variant key of the searched product with the key of every kit item. The key now
-- trims spaces at the start and end of each part, lower(btrim(...)), the same as the suggestion list and
-- registry_variant_packages in 20261117120000_variant_key_btrim.sql. Only the `variant` comparison changes; the body,
-- the signature (medicine_check(bigint) returns jsonb) and the shape of the answer are as in
-- 20261010120000_medicine_check.sql. CREATE OR REPLACE keeps the owner and the privileges (execute revoked from public
-- and anon, granted to authenticated), so no grants are repeated.
--
-- This migration reads kit_items, so it is NOT part of REGISTRY_MIGRATIONS (the scratch database of the registry
-- import test has no kit_items).
--
-- Deploy order: merge the PR first, THEN run `npx supabase db push` by hand (see 20261117120000_variant_key_btrim.sql).
-- Rollback: restore medicine_check from 20261010120000_medicine_check.sql.

-- The searched sets come from p_product_id itself (the suggestion's representative), not from its
-- variant siblings. The product is not filtered by removed_at: the daily import can withdraw it
-- between page load and pick. Unknown id -> NULL. The variant key (btrim) matches the search list and
-- registry_variant_packages, but without their removed_at filters (withdrawn packs in the kit count).
create or replace function public.medicine_check(p_product_id bigint)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
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
  matched as (
    select
      kit.*,
      case
        when e.variant then 'variant'
        when e.common_name or e.substances then 'substance'
      end as match,
      case
        when e.variant then null
        when e.common_name then 'common_name'
        when e.substances then 'substances'
      end as matched_by
    from kit
    cross join searched s
    cross join lateral (
      select
        lower(btrim(kit.name)) = lower(btrim(s.name))
          and lower(btrim(coalesce(kit.strength, ''))) = lower(btrim(coalesce(s.strength, '')))
          and lower(btrim(coalesce(kit.pharmaceutical_form, ''))) = lower(btrim(coalesce(s.pharmaceutical_form, '')))
          as variant,
        cardinality(s.common_name_set) > 0
          and public.medicine_check_common_name_set(kit.common_name) = s.common_name_set
          as common_name,
        cardinality(s.substance_set) > 0
          and public.medicine_check_substance_set(kit.product_id) = s.substance_set
          as substances
    ) e
    where e.variant or e.common_name or e.substances
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
          order by (m.match = 'variant') desc, m.expires_on asc nulls last, m.created_at desc, m.id desc
        ),
        '[]'::jsonb
      )
      from matched m
    )
  )
  from searched s
$$;

comment on function public.medicine_check(bigint) is
  'Checks a registry product against the caller''s kit: the searched product (full strength, substances in position order), whether it is comparable (non-empty common-name or substance set) and the matching kit items, variant matches first, then by expiry (unknown last), newest first. A variant match uses the same key as the suggestion list and registry_variant_packages: lower(btrim()) of name, strength and pharmaceutical form. NULL for an unknown product.';
