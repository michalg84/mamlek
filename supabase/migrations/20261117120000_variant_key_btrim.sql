-- Variant key with btrim — variant-key-btrim, phase 1 (registry part).
--
-- The variant key of a medicine is lower(name) | lower(strength) | lower(pharmaceutical form). Five pairs of registry
-- products differ only by a space at the end of the strength, so they were listed as separate variants and a check
-- for one did not find the other in the kit. The key now trims spaces at the start and end of each part:
-- lower(btrim(...)). A double space INSIDE a part and non-breaking spaces stay as they are (author's decision of
-- 2026-10-13). The data is not changed.
--
-- Two functions are redefined here, with the bodies of 20261116120000_withdrawn_medicine_in_kit.sql and only the key
-- changed:
--   registry_refresh_search_list()     partition by the key with btrim (one list variant per trimmed key)
--   registry_variant_packages(bigint)  the siblings joined on the key with btrim
-- The check rule public.medicine_check changes in the next migration: it reads kit_items, so it is kept apart from this
-- one, which the registry import test also applies on a scratch database without kit_items.
--
-- Deploy order: merge the PR first (the new client key trims too, which is only looser against the old database),
-- THEN run `npx supabase db push` by hand. The other way round, the old client would compare a strength with a
-- trailing space to the list's representative without one and lose "already have" in the CSV import.
--
-- Rollback: restore the previous definitions of registry_refresh_search_list and registry_variant_packages from
-- 20261116120000_withdrawn_medicine_in_kit.sql (the latter via drop + create plus its revoke/grant), restore
-- medicine_check from 20261010120000_medicine_check.sql, then run `select public.registry_refresh_search_list();`.

-- ---------------------------------------------------------------------------
-- registry_refresh_search_list: the key with btrim
-- ---------------------------------------------------------------------------

-- CREATE OR REPLACE keeps the owner and the privileges (execute stays revoked from public, anon and authenticated).
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
        partition by lower(btrim(p.name)), lower(btrim(coalesce(p.strength, ''))), lower(btrim(coalesce(p.pharmaceutical_form, '')))
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
  'Rebuilds the single registry_search_list row from the latest registry_imports row and all products, active and withdrawn; no-op when nothing has been imported. One representative per variant key (lower(btrim()) of name, strength and pharmaceutical form), active products first, so a variant is withdrawn only when every product with its key is withdrawn; a withdrawn variant''s tuple has a 7th element, true, and the tuple of an active variant has six. The version is max(version) + 1 or the current Unix time in seconds, whichever is larger, so it never repeats. Called by the import and by migrations; not executable by API roles.';

-- ---------------------------------------------------------------------------
-- registry_variant_packages: the siblings joined on the key with btrim
-- ---------------------------------------------------------------------------

-- Same return type as after 20261116120000, so CREATE OR REPLACE is enough and the privileges stay (execute revoked
-- from public and anon, granted to authenticated). The key is read from p_product_id WITHOUT filtering removed_at.
create or replace function public.registry_variant_packages(p_product_id bigint)
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
    on lower(btrim(p.name)) = lower(btrim(base.name))
   and lower(btrim(coalesce(p.strength, ''))) = lower(btrim(coalesce(base.strength, '')))
   and lower(btrim(coalesce(p.pharmaceutical_form, ''))) = lower(btrim(coalesce(base.pharmaceutical_form, '')))
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
  'All packages, active and withdrawn, of all products sharing the variant key (lower(btrim()) of name, strength and pharmaceutical form) of the given product; the given product itself may be withdrawn. A package is withdrawn (last column) when it or its product is withdrawn. Active packages first, then withdrawn; within each group the given product''s packages first, then by product id and package id.';

-- Production gets the merged list and a new version without a new import (no-op on an empty local database).
select public.registry_refresh_search_list();
