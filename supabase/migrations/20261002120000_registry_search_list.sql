-- Registry search suggestions list — registry-search-suggestions, phase 1.
--
-- One precomputed list of medicine variants (name + strength + pharmaceutical form) for the
-- browser-side suggestion search. A variant is one distinct (lower(name), lower(strength),
-- lower(pharmaceutical_form)) among active registry products (removed_at IS NULL); duplicates
-- collapse into a single representative product (non-IR procedure first, then the lowest id).
--
-- Write path: public.registry_refresh_search_list(), called by the import script
-- (scripts/registry-import.mjs, in the import transaction) and once at the end of this migration.
-- Both run as the table owner. The function is not executable by API roles.
--
-- Read path: authenticated users only, SELECT only. A single row (id = 1) holds the current list;
-- payload is JSON text so the API returns it as one cacheable string.
--
-- version grows by 1 on every refresh, including a refresh from a migration that changes the
-- function without a new import, so browsers never keep a list in an outdated shape.

-- ---------------------------------------------------------------------------
-- registry_search_list
-- ---------------------------------------------------------------------------

create table public.registry_search_list (
  id smallint primary key default 1 check (id = 1),
  version bigint not null,
  import_id bigint not null references public.registry_imports (id),
  snapshot_date date not null,
  variant_count int not null,
  payload text not null,
  built_at timestamptz not null default now()
);

comment on table public.registry_search_list is
  'Single row (id = 1) with the current list of medicine variants for the browser-side suggestion search. Rebuilt by registry_refresh_search_list() on every import.';
comment on column public.registry_search_list.id is 'Always 1: there is one current list.';
comment on column public.registry_search_list.version is 'List version for the browser cache; increases by 1 on every rebuild.';
comment on column public.registry_search_list.import_id is 'registry_imports row the list was built after (informational).';
comment on column public.registry_search_list.snapshot_date is 'Registry state date of the import the list was built from.';
comment on column public.registry_search_list.variant_count is 'Number of variants in payload.';
comment on column public.registry_search_list.payload is 'JSON text: {"version", "snapshotDate", "variants": [[id, name, strength, form, commonName, [substance, ...]], ...]}; strength trimmed to 80 characters with an ellipsis; missing fields are null.';
comment on column public.registry_search_list.built_at is 'When the list was last rebuilt.';

-- ---------------------------------------------------------------------------
-- registry_refresh_search_list()
-- ---------------------------------------------------------------------------

create function public.registry_refresh_search_list()
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
  select coalesce(max(l.version), 0) + 1 into v_version from public.registry_search_list l;

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
  'Rebuilds the single registry_search_list row from the latest registry_imports row and the active products; no-op when nothing has been imported. Called by the import and by migrations; not executable by API roles.';

-- ---------------------------------------------------------------------------
-- Row level security: read-only for authenticated, no API writes
-- ---------------------------------------------------------------------------

alter table public.registry_search_list enable row level security;

create policy "authenticated can select registry_search_list"
  on public.registry_search_list
  for select
  to authenticated
  using (true);

-- No INSERT/UPDATE/DELETE policies on purpose: only registry_refresh_search_list() writes, as the table owner.

grant select on public.registry_search_list to authenticated;

-- Supabase default privileges grant API roles full DML on new public tables (see the registry
-- tables migration); write privileges are revoked explicitly. SELECT stays: anon still sees no
-- rows because it has no policy.
revoke insert, update, delete, truncate, references, trigger on public.registry_search_list
from anon, authenticated;

-- Supabase default privileges also grant EXECUTE on new public functions to API roles, which
-- would let any signed-in user rebuild the list through rpc.
revoke execute on function public.registry_refresh_search_list() from public, anon, authenticated;

-- Production gets the list without a new import (no-op on an empty local database).
select public.registry_refresh_search_list();
