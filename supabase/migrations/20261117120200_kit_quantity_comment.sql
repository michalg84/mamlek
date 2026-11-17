-- Kit quantity semantics: the column comment — kit-quantity-semantics, phase 2.
--
-- The quantity counts pieces when the pack is counted in pieces (tablets, capsules, patches...) and pack units
-- otherwise. The pack size is no longer a limit in the API: a quantity above it is saved and the screen only warns.
-- Only the comment changes; no schema, data or privileges.
--
-- This migration touches kit_items and no function the importer calls, so it is NOT part of REGISTRY_MIGRATIONS.
--
-- Deploy order: merge the PR first, THEN run `npx supabase db push` by hand.
-- Rollback: restore the comment from 20261007120000_kit_items.sql.

comment on column public.kit_items.quantity is
  'Amount left: pieces when the pack is counted in pieces (e.g. tablets), otherwise pack units; NULL when unknown. '
  'The pack size is only a warning in the app, not a limit; the API caps the value at 100000.';
