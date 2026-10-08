-- Household kit — add-medicine-to-kit, phase 1.
--
-- public.kit_items is the household's medicine kit: one row per physical pack, owned by the
-- signed-in account. Unlike the registry tables (read-only copy, written by the import as the
-- table owner), this is user data: authenticated users read and write their own rows through
-- the API, so each operation has its own policy scoped to user_id = auth.uid().
--
-- The quantity cap is enforced in the API (it depends on parsing registry_packages.units),
-- not by a constraint.

-- ---------------------------------------------------------------------------
-- kit_items
-- ---------------------------------------------------------------------------

create table public.kit_items (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  package_id bigint not null references public.registry_packages (id),
  quantity integer check (quantity >= 0),
  expires_on date,
  expiry_precision text check (expiry_precision in ('month', 'day')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kit_items_expiry_pair_check check ((expires_on is null) = (expiry_precision is null))
);

-- List per user and count duplicates of the same pack.
create index kit_items_user_id_package_id_idx on public.kit_items (user_id, package_id);

comment on table public.kit_items is
  'Household medicine kit: one row per physical pack, owned by one account. Readable and writable only by its owner.';
comment on column public.kit_items.user_id is 'Owning account (auth.users.id); defaults to the caller. Rows are deleted with the account.';
comment on column public.kit_items.package_id is 'Registry package this pack is an instance of (registry_packages.id).';
comment on column public.kit_items.quantity is 'Units left in the pack (e.g. tablets); NULL when unknown. The upper bound is enforced in the API.';
comment on column public.kit_items.expires_on is 'Expiry date as entered; for month precision the last day of the month. NULL when unknown.';
comment on column public.kit_items.expiry_precision is 'Precision of expires_on: month or day; NULL exactly when expires_on is NULL.';

-- ---------------------------------------------------------------------------
-- Row level security: owner-only, per operation
-- ---------------------------------------------------------------------------

alter table public.kit_items enable row level security;

create policy "authenticated can select own kit_items"
  on public.kit_items
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "authenticated can insert own kit_items"
  on public.kit_items
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "authenticated can update own kit_items"
  on public.kit_items
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "authenticated can delete own kit_items"
  on public.kit_items
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- No policies for anon: it sees and writes nothing.

-- Differs from the read-only registry tables: here the API roles do write, so DML is granted
-- to authenticated (the registry tables revoke it). anon gets nothing. TRUNCATE, REFERENCES
-- and TRIGGER are not row-level and bypass RLS, so they are revoked from authenticated.
grant select, insert, update, delete on public.kit_items to authenticated;
revoke all on public.kit_items from anon;
revoke truncate, references, trigger on public.kit_items from authenticated;

-- ---------------------------------------------------------------------------
-- registry_variant_packages: active packs of a suggestion's whole variant
-- ---------------------------------------------------------------------------

-- The search list collapses a variant (lower(name), lower(strength), lower(pharmaceutical_form))
-- into one representative product, but the user's box may come from a sibling (e.g. a parallel
-- import). This returns the active packs of every active product sharing the variant key of
-- p_product_id. The key is read from p_product_id WITHOUT filtering removed_at: the daily
-- import can withdraw the representative between page load and pick, and its siblings must
-- still be found. Unknown id -> empty result. Null handling matches the search-list variant
-- definition (coalesce(..., '')).
create function public.registry_variant_packages(p_product_id bigint)
returns table (
  package_id bigint,
  product_id bigint,
  gtin text,
  availability_category text,
  units jsonb,
  marketing_authorization_holder text
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
    p.marketing_authorization_holder
  from public.registry_products base
  join public.registry_products p
    on lower(p.name) = lower(base.name)
   and lower(coalesce(p.strength, '')) = lower(coalesce(base.strength, ''))
   and lower(coalesce(p.pharmaceutical_form, '')) = lower(coalesce(base.pharmaceutical_form, ''))
  join public.registry_packages pk
    on pk.product_id = p.id
  where base.id = p_product_id
    and p.removed_at is null
    and pk.removed_at is null
  order by (p.id = p_product_id) desc, p.id, pk.id
$$;

comment on function public.registry_variant_packages(bigint) is
  'Active packages of all active products sharing the variant key (lower name, strength, pharmaceutical form) of the given product; the given product itself may be removed. Representative''s packs first.';

revoke execute on function public.registry_variant_packages(bigint) from public, anon;
grant execute on function public.registry_variant_packages(bigint) to authenticated;
