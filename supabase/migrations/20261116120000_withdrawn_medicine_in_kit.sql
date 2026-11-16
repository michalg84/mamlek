-- Withdrawn medicines in the kit — withdrawn-medicine-in-kit, phase 1.
--
-- A medicine withdrawn from the registry (RPL) can still sit in a household's cabinet, so it must be
-- possible to find it, add it to the kit, import it from CSV and check it. Two functions change:
--
--   1. registry_refresh_search_list() lists withdrawn variants too. A variant is withdrawn only when
--      EVERY product with its key is withdrawn: an active product always wins the representative
--      slot (first in the ranking), so "the representative is withdrawn" means "the whole variant is
--      withdrawn". Such a variant gets an optional 7th tuple element, `true`. The tuples of active
--      variants stay byte for byte as they were, and a client that does not know the 7th element
--      ignores it (the tuple is positional).
--   2. registry_variant_packages() returns the withdrawn packages of the variant as well (of
--      withdrawn products too), with a new last column `withdrawn`, active packages first.
--
-- The RLS policies of kit_items do NOT change: they only check user_id = auth.uid(), and the
-- database already accepts a package that is withdrawn (nothing in the table refuses it); only the
-- filter inside registry_variant_packages and the API hid such packages. medicine_check already
-- answers for a withdrawn product and is not touched here.
--
-- Deploy order: merge the PR first (the new code understands both the old and the new database),
-- THEN run `npx supabase db push` by hand. The other way round, the old code would show withdrawn
-- variants without a marker and adding their packages would fail with a 400.

-- ---------------------------------------------------------------------------
-- registry_refresh_search_list: withdrawn variants, flagged, active representative first
-- ---------------------------------------------------------------------------

-- Same body as in 20261002130000_registry_search_list_version.sql; only the `ranked` CTE (no filter on
-- removed_at, active products rank first) and the tuple (7th element for a withdrawn variant) change.
-- CREATE OR REPLACE keeps the owner and the privileges (execute stays revoked from public, anon and
-- authenticated).
create or replace function public.registry_refresh_search_list()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_import_id bigint;
  v_snapshot_date date;
  v_version bigint;
  v_count int;
  v_payload jsonb;
begin
  select i.id, i.snapshot_date
    into v_import_id, v_snapshot_date
    from public.registry_imports i
    order by i.id desc
    limit 1;

  -- Nothing imported yet (e.g. this migration on an empty local database).
  if not found then
    return;
  end if;

  -- The payload embeds the version, so it is computed before the payload is built.
  select greatest(coalesce(max(l.version), 0) + 1, extract(epoch from now())::bigint)
    into v_version
    from public.registry_search_list l;

  -- All products (active and withdrawn), one representative per variant key.
  with ranked as (
    select
      p.id,
      p.name,
      p.strength,
      p.pharmaceutical_form,
      p.common_name,
      p.removed_at,
      row_number() over (
        partition by lower(p.name), lower(coalesce(p.strength, '')), lower(coalesce(p.pharmaceutical_form, ''))
        -- Active products first, so a variant is withdrawn only when all its products are; then non-IR
        -- products (NULL procedure_type counts as non-IR), then the lowest id.
        order by (p.removed_at is not null), (p.procedure_type is not distinct from 'IR'), p.id
      ) as rn
    from public.registry_products p
  )
  select
    count(*)::int,
    jsonb_build_object(
      'version', v_version,
      'snapshotDate', to_char(v_snapshot_date, 'YYYY-MM-DD'),
      'variants', coalesce(
        jsonb_agg(
          -- Six elements; a withdrawn variant (its representative is withdrawn) gets a 7th, `true`.
          case when r.removed_at is not null then
            jsonb_build_array(
              r.id,
              r.name,
              case when length(r.strength) > 80 then left(r.strength, 79) || '…' else r.strength end,
              r.pharmaceutical_form,
              r.common_name,
              (
                select coalesce(jsonb_agg(s.name order by s.position), '[]'::jsonb)
                from public.registry_product_substances s
                where s.product_id = r.id
              )
            ) || '[true]'::jsonb
          else
            jsonb_build_array(
              r.id,
              r.name,
              case when length(r.strength) > 80 then left(r.strength, 79) || '…' else r.strength end,
              r.pharmaceutical_form,
              r.common_name,
              (
                select coalesce(jsonb_agg(s.name order by s.position), '[]'::jsonb)
                from public.registry_product_substances s
                where s.product_id = r.id
              )
            )
          end
        ),
        '[]'::jsonb
      )
    )
    into v_count, v_payload
    from ranked r
    where r.rn = 1;

  insert into public.registry_search_list (id, version, import_id, snapshot_date, variant_count, payload)
  values (1, v_version, v_import_id, v_snapshot_date, v_count, v_payload::text)
  on conflict (id) do update set
    version = excluded.version,
    import_id = excluded.import_id,
    snapshot_date = excluded.snapshot_date,
    variant_count = excluded.variant_count,
    payload = excluded.payload,
    built_at = now();
end;
$$;

comment on function public.registry_refresh_search_list() is
  'Rebuilds the single registry_search_list row from the latest registry_imports row and all products, active and withdrawn; no-op when nothing has been imported. One representative per variant key (lower name, strength, pharmaceutical form), active products first, so a variant is withdrawn only when every product with its key is withdrawn; a withdrawn variant''s tuple has a 7th element, true, and the tuple of an active variant has six. The version is max(version) + 1 or the current Unix time in seconds, whichever is larger, so it never repeats. Called by the import and by migrations; not executable by API roles.';

-- ---------------------------------------------------------------------------
-- registry_variant_packages: every package of the variant, with a withdrawn flag
-- ---------------------------------------------------------------------------

-- The return type changes (a new last column), which CREATE OR REPLACE does not accept: drop and create,
-- then repeat the privileges. `if exists`: the scratch database of the registry import test has the
-- registry migrations only, so it does not have the kit_items migration that created this function.
drop function if exists public.registry_variant_packages(bigint);

-- The key is read from p_product_id WITHOUT filtering removed_at, as before: the daily import can
-- withdraw the representative between page load and pick, and its siblings must still be found. Now no
-- removed_at filter is left: the packages of withdrawn products and the withdrawn packages come too, flagged
-- with `withdrawn`, after the active ones. Unknown id -> empty result.
create function public.registry_variant_packages(p_product_id bigint)
returns table (
  package_id bigint,
  product_id bigint,
  gtin text,
  availability_category text,
  units jsonb,
  marketing_authorization_holder text,
  withdrawn boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    pk.id as package_id,
    p.id as product_id,
    pk.gtin,
    pk.availability_category,
    pk.units,
    p.marketing_authorization_holder,
    (pk.removed_at is not null or p.removed_at is not null) as withdrawn
  from public.registry_products base
  join public.registry_products p
    on lower(p.name) = lower(base.name)
   and lower(coalesce(p.strength, '')) = lower(coalesce(base.strength, ''))
   and lower(coalesce(p.pharmaceutical_form, '')) = lower(coalesce(base.pharmaceutical_form, ''))
  join public.registry_packages pk
    on pk.product_id = p.id
  where base.id = p_product_id
  order by
    (pk.removed_at is not null or p.removed_at is not null),
    (p.id = p_product_id) desc,
    p.id,
    pk.id
$$;

comment on function public.registry_variant_packages(bigint) is
  'All packages, active and withdrawn, of all products sharing the variant key (lower name, strength, pharmaceutical form) of the given product; the given product itself may be withdrawn. A package is withdrawn (last column) when it or its product is withdrawn. Active packages first, then withdrawn; within each group the given product''s packages first, then by product id and package id.';

revoke execute on function public.registry_variant_packages(bigint) from public, anon;
grant execute on function public.registry_variant_packages(bigint) to authenticated;

-- Production gets the list with withdrawn variants and a new version without a new import
-- (no-op on an empty local database).
select public.registry_refresh_search_list();
