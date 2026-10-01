-- Registry copy (RPL, Rejestr Produktów Leczniczych) — F-01 registry-copy-load, phase 1.
--
-- Four tables holding a copy of the RPL XML export v6.0.0
-- (namespace http://rejestry.ezdrowie.gov.pl/rpl/eksport-danych-v6.0.0).
--
-- Write path: the import script (scripts/registry-import.mjs) connects directly to
-- Postgres as the table owner, so RLS does not apply to it. Rows that disappear from
-- the export are never deleted: they get removed_at instead (products are referenced
-- by user data from S-02 on).
--
-- Read path: authenticated users only, SELECT only. No INSERT/UPDATE/DELETE policies,
-- so API roles cannot write.
--
-- Conventions: empty XML strings are stored as NULL; text columns have no length limit
-- (e.g. moc reaches 1 831 characters); list columns default to an empty array.

-- ---------------------------------------------------------------------------
-- registry_products
-- ---------------------------------------------------------------------------

create table public.registry_products (
  id bigint primary key,
  name text not null,
  common_name text,
  previous_name text,
  strength text,
  pharmaceutical_form text,
  marketing_authorization_holder text,
  procedure_type text,
  authorization_number text,
  authorization_validity text,
  atc_codes text[] not null default '{}',
  routes text[] not null default '{}',
  leaflet_url text,
  characteristic_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz
);

comment on table public.registry_products is
  'Copy of RPL medicinal products (XML element produktLeczniczy), human products only (rodzajPreparatu = ludzki). Rows missing from a later export get removed_at instead of being deleted.';
comment on column public.registry_products.id is 'RPL product id (XML produktLeczniczy@id).';
comment on column public.registry_products.name is 'Product name (XML nazwaProduktu).';
comment on column public.registry_products.common_name is 'Common name / INN (XML nazwaPowszechnieStosowana).';
comment on column public.registry_products.previous_name is 'Previous product name (XML nazwaPoprzedniaProduktu); the placeholder value "brak" is stored as NULL.';
comment on column public.registry_products.strength is 'Strength, free text up to ~1 800 characters (XML moc).';
comment on column public.registry_products.pharmaceutical_form is 'Pharmaceutical form (XML nazwaPostaciFarmaceutycznej).';
comment on column public.registry_products.marketing_authorization_holder is 'Marketing authorization holder (XML podmiotOdpowiedzialny).';
comment on column public.registry_products.procedure_type is 'Authorization procedure type, e.g. NAR, DCP, MRP, CEN, IR (XML typProcedury).';
comment on column public.registry_products.authorization_number is 'Marketing authorization number (XML numerPozwolenia).';
comment on column public.registry_products.authorization_validity is 'Raw authorization validity: a date, "Bezterminowe", "Pozwolenie zawieszone" or NULL (XML waznoscPozwolenia). Not interpreted by the import.';
comment on column public.registry_products.atc_codes is 'ATC codes in XML order (XML kodyATC/kodATC); empty array when none.';
comment on column public.registry_products.routes is 'Routes of administration in XML order (XML drogiPodania/drogaPodania@drogaPodaniaNazwa); empty array when none.';
comment on column public.registry_products.leaflet_url is 'Patient leaflet URL (XML ulotka).';
comment on column public.registry_products.characteristic_url is 'Summary of product characteristics URL (XML charakterystyka).';
comment on column public.registry_products.created_at is 'When the row was first imported.';
comment on column public.registry_products.updated_at is 'Last actual change of the row data or of removed_at (not the last import; see registry_imports).';
comment on column public.registry_products.removed_at is 'When the product disappeared from the export; NULL means active. Cleared when the product reappears.';

-- ---------------------------------------------------------------------------
-- registry_product_substances
-- ---------------------------------------------------------------------------

create table public.registry_product_substances (
  product_id bigint not null references public.registry_products (id) on delete cascade,
  position smallint not null,
  name text not null,
  amount text,
  unit text,
  preparation_amount text,
  preparation_unit text,
  other_description text,
  primary key (product_id, position)
);

comment on table public.registry_product_substances is
  'Active substances of a registry product (XML substancjeCzynne/substancjaCzynna). Replaced per product on every import; a product may have none.';
comment on column public.registry_product_substances.product_id is 'Owning product (XML produktLeczniczy@id).';
comment on column public.registry_product_substances.position is 'Position of the substance within the product, following XML order (starting at 1).';
comment on column public.registry_product_substances.name is 'Substance name (XML nazwaSubstancji).';
comment on column public.registry_product_substances.amount is 'Substance amount as text (XML iloscSubstancji).';
comment on column public.registry_product_substances.unit is 'Unit of the substance amount (XML jednostkaMiaryIlosciSubstancji).';
comment on column public.registry_product_substances.preparation_amount is 'Amount of preparation the substance amount refers to (XML iloscPreparatu).';
comment on column public.registry_product_substances.preparation_unit is 'Unit of the preparation amount (XML jednostkaMiaryIlosciPreparatu).';
comment on column public.registry_product_substances.other_description is 'Other description of the amount (XML innyOpisIlosci).';

-- ---------------------------------------------------------------------------
-- registry_packages
-- ---------------------------------------------------------------------------

create table public.registry_packages (
  id bigint primary key,
  product_id bigint not null references public.registry_products (id) on delete cascade,
  gtin text,
  availability_category text,
  units jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz
);

create index registry_packages_product_id_idx on public.registry_packages (product_id);

comment on table public.registry_packages is
  'Packages of a registry product (XML opakowania/opakowanie). Packages missing from the export or marked skasowane="TAK" get removed_at instead of being deleted.';
comment on column public.registry_packages.id is 'RPL package id (XML opakowanie@id).';
comment on column public.registry_packages.product_id is 'Owning product (XML produktLeczniczy@id).';
comment on column public.registry_packages.gtin is 'GTIN code (XML kodGTIN).';
comment on column public.registry_packages.availability_category is 'Availability category, e.g. OTC, Rp, Rpz, Rpw, Lz (XML kategoriaDostepnosci).';
comment on column public.registry_packages.units is 'Package units in XML order (XML jednostkiOpakowania/jednostkaOpakowania): array of {count (liczbaOpakowan), kind (rodzajOpakowania), capacity (pojemnosc), capacity_unit (jednostkaPojemnosci), info (informacjeDodatkowe)}; empty array when none.';
comment on column public.registry_packages.created_at is 'When the row was first imported.';
comment on column public.registry_packages.updated_at is 'Last actual change of the row data or of removed_at (not the last import; see registry_imports).';
comment on column public.registry_packages.removed_at is 'When the package disappeared from the export or became skasowane="TAK"; NULL means active.';

-- ---------------------------------------------------------------------------
-- registry_imports
-- ---------------------------------------------------------------------------

create table public.registry_imports (
  id bigint generated always as identity primary key,
  snapshot_date date not null,
  source text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default clock_timestamp(),
  products_active int not null,
  products_removed int not null,
  substances int not null,
  packages_active int not null
);

comment on table public.registry_imports is
  'One row per successful registry import (written in the same transaction as the data).';
comment on column public.registry_imports.snapshot_date is 'Registry state date of the export (XML produktyLecznicze@stanNaDzien).';
comment on column public.registry_imports.source is 'Export source: download URL or local file name.';
comment on column public.registry_imports.started_at is 'When the import started.';
comment on column public.registry_imports.finished_at is 'When the import finished writing.';
comment on column public.registry_imports.products_active is 'Active products (removed_at IS NULL) in the database after the import.';
comment on column public.registry_imports.products_removed is 'Products marked as removed by this import.';
comment on column public.registry_imports.substances is 'Substance rows in the database after the import.';
comment on column public.registry_imports.packages_active is 'Active packages (removed_at IS NULL) in the database after the import.';

-- ---------------------------------------------------------------------------
-- Row level security: read-only for authenticated, no API writes
-- ---------------------------------------------------------------------------

alter table public.registry_products enable row level security;
alter table public.registry_product_substances enable row level security;
alter table public.registry_packages enable row level security;
alter table public.registry_imports enable row level security;

create policy "authenticated can select registry_products"
  on public.registry_products
  for select
  to authenticated
  using (true);

create policy "authenticated can select registry_product_substances"
  on public.registry_product_substances
  for select
  to authenticated
  using (true);

create policy "authenticated can select registry_packages"
  on public.registry_packages
  for select
  to authenticated
  using (true);

create policy "authenticated can select registry_imports"
  on public.registry_imports
  for select
  to authenticated
  using (true);

-- No INSERT/UPDATE/DELETE policies on purpose: the import writes as the table owner.

grant select on
  public.registry_products,
  public.registry_product_substances,
  public.registry_packages,
  public.registry_imports
to authenticated;
