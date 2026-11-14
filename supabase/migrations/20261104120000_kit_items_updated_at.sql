-- Household kit — kit-browse-edit, phase 1.
--
-- kit_items.updated_at has defaulted to now() since the table was created, but nothing moved it:
-- the first update path (PATCH /api/kit/[id]) lands with this change, so every update now sets it.
-- Existing values stay as they are.

create function public.kit_items_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

comment on function public.kit_items_set_updated_at() is
  'Trigger function: sets kit_items.updated_at to now() on every update, whatever the statement wrote into the column.';

create trigger kit_items_set_updated_at
  before update on public.kit_items
  for each row
  execute function public.kit_items_set_updated_at();

-- No revoke execute: a function that returns trigger cannot be called directly, so there is nothing to take away.
