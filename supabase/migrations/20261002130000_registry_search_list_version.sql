-- Registry search list: versions that never repeat — registry-search-suggestions, phase 2 review (F1).
--
-- The browser keeps GET /api/registry/search-list?v=<version> for a year (Cache-Control: immutable).
-- With version = max(version) + 1, a deleted row, a database reset or a restored backup restarts the
-- version at 1, and a browser that cached an older list under the same number would never refetch it.
-- The version is now max(version) + 1 or the current Unix time in seconds, whichever is larger, so it
-- always grows and stays unique across resets. It is no longer exactly +1 per rebuild.
--
-- Only the version expression changes; CREATE OR REPLACE keeps the owner and the privileges
-- (execute stays revoked from public, anon and authenticated).

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

  with ranked as (
    select
      p.id,
      p.name,
      p.strength,
      p.pharmaceutical_form,
      p.common_name,
      row_number() over (
        partition by lower(p.name), lower(coalesce(p.strength, '')), lower(coalesce(p.pharmaceutical_form, ''))
        -- Non-IR products first (NULL procedure_type counts as non-IR), then the lowest id.
        order by (p.procedure_type is not distinct from 'IR'), p.id
      ) as rn
    from public.registry_products p
    where p.removed_at is null
  )
  select
    count(*)::int,
    jsonb_build_object(
      'version', v_version,
      'snapshotDate', to_char(v_snapshot_date, 'YYYY-MM-DD'),
      'variants', coalesce(
        jsonb_agg(
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
  'Rebuilds the single registry_search_list row from the latest registry_imports row and the active products; no-op when nothing has been imported. The version is max(version) + 1 or the current Unix time in seconds, whichever is larger, so it never repeats. Called by the import and by migrations; not executable by API roles.';

comment on column public.registry_search_list.version is 'List version for the browser cache; always increases (max + 1 or the Unix time of the rebuild, whichever is larger).';

-- Production gets an epoch-based version without a new import (no-op on an empty local database).
select public.registry_refresh_search_list();
