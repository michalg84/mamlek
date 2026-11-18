// Tests of the variant key on a real local database, on synthetic products that are rolled back. The key is
// lower(btrim(name)) | lower(btrim(strength)) | lower(btrim(form)): spaces at the start or end of a part do not make
// another medicine, so two registry products that differ only by a trailing space in the strength are one variant. The
// key is compared in three SQL places, all pinned here: public.medicine_check (the kit item of the other spelling is
// found as the same medicine), public.registry_variant_packages (the packs of both spellings come together) and
// public.registry_refresh_search_list (one suggestion for the pair). A double space INSIDE a part is not trimmed
// (author's decision of 2026-10-13), so such a pair stays two variants. The expected values come from the plan of
// variant-key-btrim and that decision, not from running the functions.
//
// The two spellings carry different common names and substances, so a match between them cannot come through the
// same-substance rule: `variant` is the only path to it.
import type pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { checkVerdict, parseMedicineCheck } from "@/lib/medicine-check-verdict";
import type { MedicineCheckResponse } from "@/types";
import { BEFORE_ANY_EXPIRY, World, actAs, actAsOwner, checkAs, connectLocal } from "./medicine-check-fixtures";

const w = new World();

// --- One medicine in two spellings of the strength: a trailing space -------------------------------------------------

const plain = w.product({
  name: "Trimvar",
  strength: "0,5 mg/ml",
  form: "roztwór na skórę",
  commonName: "Trimvarum primum",
  substances: ["Substantia alfa"],
});
const padded = w.product({
  name: "Trimvar",
  strength: "0,5 mg/ml ",
  form: "roztwór na skórę",
  commonName: "Trimvarum secundum",
  substances: ["Substantia beta"],
});

// The kit holds the padded spelling, the check is asked for the plain one, and the other way round.
const uKitPadded = w.user();
const kKitPadded = w.kitItem(uKitPadded, padded.packageId);
const uKitPlain = w.user();
const kKitPlain = w.kitItem(uKitPlain, plain.packageId);

// --- Boundary: a double space inside the strength is not trimmed, so these are two medicines -------------------------

const single = w.product({
  name: "Dblspace",
  strength: "0,5 mg/ml",
  form: "roztwór na skórę",
  commonName: "Dblspacum primum",
  substances: ["Substantia gamma"],
});
const doubled = w.product({
  name: "Dblspace",
  strength: "0,5  mg/ml",
  form: "roztwór na skórę",
  commonName: "Dblspacum secundum",
  substances: ["Substantia delta"],
});
const uKitDoubled = w.user();
w.kitItem(uKitDoubled, doubled.packageId);

let client: pg.Client;

beforeAll(async () => {
  client = await connectLocal();
  await client.query("begin");
  await w.seed(client);
});

afterAll(async () => {
  await client.query("rollback").catch(() => undefined);
  await client.end().catch(() => undefined);
});

// A failed statement aborts the transaction; a savepoint per test keeps one failure from failing the rest.
beforeEach(async () => {
  await client.query("savepoint t");
});

afterEach(async () => {
  await client.query("rollback to savepoint t");
  await client.query("release savepoint t");
});

/** The answer of the rule, which must pass the guard the screen applies. */
async function answer(user: string, product: number): Promise<MedicineCheckResponse> {
  const raw = await checkAs(client, user, product);
  const parsed = parseMedicineCheck(raw);
  if (!parsed) {
    throw new Error(`The screen would reject this answer of the rule: ${JSON.stringify(raw)}`);
  }
  return parsed;
}

/** [package id, product id, withdrawn] of every package of the variant, in the order the function returns them. */
async function packagesOf(user: string, productId: number): Promise<[string, string, boolean][]> {
  await actAs(client, user);
  const { rows } = await client.query<{ package_id: string; product_id: string; withdrawn: boolean }>(
    "select * from public.registry_variant_packages($1::bigint)",
    [productId],
  );
  return rows.map((row) => [row.package_id, row.product_id, row.withdrawn]);
}

const row = (packageId: number, productId: number, withdrawn = false): [string, string, boolean] => [
  String(packageId),
  String(productId),
  withdrawn,
];

/**
 * Rebuilds the suggestion list as the table owner (the function is not executable by the API roles) after a
 * registry_imports row of the test's own (the function does nothing without one), then counts the variants of the list
 * with the given name. All inside the test's savepoint, so the real list row is restored.
 */
async function listedVariants(name: string): Promise<{ count: number; ids: number[] }> {
  await actAsOwner(client);
  await client.query(
    `insert into registry_imports (snapshot_date, source, products_active, products_removed, substances, packages_active)
     values (current_date, 'variant-key.test', 0, 0, 0, 0)`,
  );
  await client.query("select public.registry_refresh_search_list()");
  const { rows } = await client.query<{ id: string }>(
    `select v ->> 0 as id
       from public.registry_search_list l, jsonb_array_elements(l.payload::jsonb -> 'variants') v
      where l.id = 1 and lower(v ->> 1) = lower($1)
      order by (v ->> 0)::bigint`,
    [name],
  );
  return { count: rows.length, ids: rows.map((r) => Number(r.id)) };
}

describe("variant key: a space at the end of the strength is the same medicine", () => {
  it("medicine_check finds the kit item of the padded spelling when the plain one is checked", async () => {
    const result = await answer(uKitPadded, plain.id);

    expect(result.items.map((i) => [i.id, i.match, i.matchedBy])).toEqual([[kKitPadded.id, "variant", null]]);
    expect(checkVerdict(result, BEFORE_ANY_EXPIRY).kind).toBe("variant");
    expect(checkVerdict(result, BEFORE_ANY_EXPIRY).title).toBe("Masz ten lek · 1 opakowanie");
  });

  it("medicine_check finds the kit item of the plain spelling when the padded one is checked", async () => {
    const result = await answer(uKitPlain, padded.id);

    expect(result.items.map((i) => [i.id, i.match, i.matchedBy])).toEqual([[kKitPlain.id, "variant", null]]);
    expect(checkVerdict(result, BEFORE_ANY_EXPIRY).kind).toBe("variant");
  });

  it("registry_variant_packages of the plain product returns the packs of both spellings, its own first", async () => {
    expect(await packagesOf(uKitPlain, plain.id)).toEqual([
      row(plain.packageId, plain.id),
      row(padded.packageId, padded.id),
    ]);
  });

  it("registry_variant_packages of the padded product returns the packs of both spellings, its own first", async () => {
    expect(await packagesOf(uKitPlain, padded.id)).toEqual([
      row(padded.packageId, padded.id),
      row(plain.packageId, plain.id),
    ]);
  });

  it("the suggestion list has exactly one variant for the name and strength, whatever the spelling", async () => {
    const { count, ids } = await listedVariants("Trimvar");

    expect(count).toBe(1);
    // The representative is one of the two products (the plain one, the lowest id, by the ranking).
    expect([plain.id, padded.id]).toContain(ids[0]);
  });
});

describe("variant key: a double space inside the strength is not trimmed (author's decision)", () => {
  it("medicine_check does not take the kit item of the other spelling for the same medicine", async () => {
    const result = await answer(uKitDoubled, single.id);

    expect(result.items).toEqual([]);
    expect(checkVerdict(result, BEFORE_ANY_EXPIRY).kind).toBe("none");
  });

  it("registry_variant_packages returns the packs of the one spelling only", async () => {
    expect(await packagesOf(uKitDoubled, single.id)).toEqual([row(single.packageId, single.id)]);
    expect(await packagesOf(uKitDoubled, doubled.id)).toEqual([row(doubled.packageId, doubled.id)]);
  });

  it("the suggestion list keeps two variants for the name", async () => {
    const { count, ids } = await listedVariants("Dblspace");

    expect(count).toBe(2);
    expect(ids).toEqual([single.id, doubled.id]);
  });
});
