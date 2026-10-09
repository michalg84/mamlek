-- Medicine check — medicine-check, phase 1.
--
-- public.medicine_check(p_product_id) compares a medicine picked from the search suggestions with
-- the caller's kit and returns the matching kit items in one round trip:
--   variant    same variant key (lower name, strength, pharmaceutical form) as the searched product,
--              so parallel imports count as the same medicine; withdrawn products and packages count.
--   substance  not a variant match, but the same set of common-name parts (common_name split on "+")
--              OR the same set of active substance names. Sets are normalized (trim, lowercase,
--              collapsed whitespace); a set containing a generic placeholder (e.g. "Preparat złożony")
--              is treated as empty, and an empty set never matches.
--
-- The normalization helpers are separate functions so later changes (match levels, kit-wide checks)
-- can reuse them. Everything is security invoker: kit_items RLS limits the result to the caller's rows.

-- ---------------------------------------------------------------------------
-- Normalization helpers
-- ---------------------------------------------------------------------------

-- Conservative on purpose: a false "same substance" is worse than no answer, so spelling variants
-- (salts, Latin vs Polish names) are not merged here.
create function public.medicine_check_normalize(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(regexp_replace(p_value, '\s+', ' ', 'g')))
$$;

comment on function public.medicine_check_normalize(text) is
  'Normalizes a registry name for set comparison: trim, lowercase, whitespace collapsed to one space. NULL stays NULL.';

-- Placeholders the registry uses instead of a real common name or substance (measured on the
-- 2026-09-23 export; the list is not exhaustive).
create function public.medicine_check_is_generic(p_value text)
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
      'produkt homeopatyczny'
    ]),
    false
  )
$$;

comment on function public.medicine_check_is_generic(text) is
  'True when the normalized value is a generic registry placeholder (e.g. "Preparat złożony") that must never produce a match.';

create function public.medicine_check_common_name_set(p_common_name text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case
    when bool_or(public.medicine_check_is_generic(parts.part)) then '{}'::text[]
    else coalesce(array_agg(distinct parts.part order by parts.part), '{}'::text[])
  end
  from (
    select public.medicine_check_normalize(raw) as part
    from unnest(string_to_array(p_common_name, '+')) as raw
  ) parts
  where parts.part <> ''
$$;

comment on function public.medicine_check_common_name_set(text) is
  'Common name split on "+", normalized, without empty parts, sorted and unique. Empty array when the common name is NULL or any part is a generic placeholder.';

create function public.medicine_check_substance_set(p_product_id bigint)
returns text[]
language sql
stable
set search_path = ''
as $$
  select case
    when bool_or(public.medicine_check_is_generic(subs.name)) then '{}'::text[]
    else coalesce(array_agg(distinct subs.name order by subs.name), '{}'::text[])
  end
  from (
    select public.medicine_check_normalize(s.name) as name
    from public.registry_product_substances s
    where s.product_id = p_product_id
  ) subs
  where subs.name <> ''
$$;

comment on function public.medicine_check_substance_set(bigint) is
  'Active substance names of a registry product, normalized, sorted and unique. Empty array when the product has no substances or any of them is a generic placeholder.';

-- ---------------------------------------------------------------------------
-- medicine_check: the caller's kit items matching a searched product
-- ---------------------------------------------------------------------------

-- The searched sets come from p_product_id itself (the suggestion's representative), not from its
-- variant siblings. The product is not filtered by removed_at: the daily import can withdraw it
-- between page load and pick. Unknown id -> NULL. The variant key matches the search list and
-- registry_variant_packages, but without their removed_at filters (withdrawn packs in the kit count).
create function public.medicine_check(p_product_id bigint)
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
        lower(kit.name) = lower(s.name)
          and lower(coalesce(kit.strength, '')) = lower(coalesce(s.strength, ''))
          and lower(coalesce(kit.pharmaceutical_form, '')) = lower(coalesce(s.pharmaceutical_form, ''))
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
  'Checks a registry product against the caller''s kit: the searched product (full strength, substances in position order), whether it is comparable (non-empty common-name or substance set) and the matching kit items, variant matches first, then by expiry (unknown last), newest first. NULL for an unknown product.';

-- ---------------------------------------------------------------------------
-- Grants: authenticated only
-- ---------------------------------------------------------------------------

revoke execute on function public.medicine_check_normalize(text) from public, anon;
revoke execute on function public.medicine_check_is_generic(text) from public, anon;
revoke execute on function public.medicine_check_common_name_set(text) from public, anon;
revoke execute on function public.medicine_check_substance_set(bigint) from public, anon;
revoke execute on function public.medicine_check(bigint) from public, anon;

grant execute on function public.medicine_check_normalize(text) to authenticated;
grant execute on function public.medicine_check_is_generic(text) to authenticated;
grant execute on function public.medicine_check_common_name_set(text) to authenticated;
grant execute on function public.medicine_check_substance_set(bigint) to authenticated;
grant execute on function public.medicine_check(bigint) to authenticated;
