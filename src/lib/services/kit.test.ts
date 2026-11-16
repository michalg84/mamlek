// The registry reads of the kit service on a fake Supabase client: the pack lookups of POST /api/kit and
// POST /api/kit/import (`getPackage`, `getPackages`) and the variant's packs of PATCH /api/kit/[id]
// (`getVariantPackages`). A withdrawn medicine can be kept in the kit (withdrawn-medicine-in-kit), so a withdrawn pack,
// or a pack of a withdrawn product, is found and flagged, and only a pack that does not exist is missing.
//
// The fake applies the filters it is given (`eq`, `in`, `is`) and the top-level columns of `select` to in-memory rows,
// so a filter on `removed_at` hides the withdrawn packs here as it would in the database, and a column left out of the
// select is missing from the row.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { getPackage, getPackages, getVariantPackages } from "./kit";

type Row = Record<string, unknown>;

/** A `registry_packages` row joined with its product, as the database would answer it. */
function packRow(
  id: number,
  { packRemoved = false, productRemoved = false }: { packRemoved?: boolean; productRemoved?: boolean } = {},
): Row {
  return {
    id,
    product_id: 1000 + id,
    gtin: `0590${id}`,
    availability_category: "OTC",
    units: [{ count: "10", kind: "tabl.", capacity: null, capacity_unit: null, info: null }],
    removed_at: packRemoved ? "2026-11-01T00:00:00Z" : null,
    registry_products: {
      marketing_authorization_holder: `Holder ${id}`,
      removed_at: productRemoved ? "2026-11-01T00:00:00Z" : null,
    },
  };
}

/** Top-level columns of a PostgREST select ("a, b, rel!inner(c, d)" -> a, b, rel). */
function selectedColumns(select: string): string[] {
  const columns: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of select) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "," && depth === 0) {
      columns.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  columns.push(current);
  return columns.map((column) => column.trim().split(/[!(]/)[0]);
}

class FakeQuery implements PromiseLike<{ data: Row[]; error: null }> {
  private filters: ((row: Row) => boolean)[] = [];
  private columns: string[] = [];

  constructor(private readonly rows: Row[]) {}

  select(columns: string) {
    this.columns = selectedColumns(columns);
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  is(column: string, value: null) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  private result(): Row[] {
    return this.rows
      .filter((row) => this.filters.every((keep) => keep(row)))
      .map((row) => Object.fromEntries(this.columns.filter((column) => column in row).map((c) => [c, row[c]])));
  }

  maybeSingle() {
    const rows = this.result();
    if (rows.length > 1) {
      throw new Error("maybeSingle on more than one row");
    }
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  }

  then<T1 = { data: Row[]; error: null }, T2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve({ data: this.result(), error: null }).then(onfulfilled, onrejected);
  }
}

/** A client whose `registry_packages` holds `packs` and whose `registry_variant_packages` RPC answers `rpcRows`. */
function fakeClient(packs: Row[], rpcRows: Row[] = []): SupabaseClient {
  return {
    from(table: string) {
      if (table !== "registry_packages") {
        throw new Error(`Unexpected table ${table}`);
      }
      return new FakeQuery(packs);
    },
    rpc(name: string) {
      if (name !== "registry_variant_packages") {
        throw new Error(`Unexpected RPC ${name}`);
      }
      return Promise.resolve({ data: rpcRows, error: null });
    },
  } as unknown as SupabaseClient;
}

const UNITS = [{ count: "10", kind: "tabl.", capacity: null, capacity_unit: null, info: null }];

const ACTIVE = packRow(1);
const PACK_WITHDRAWN = packRow(2, { packRemoved: true });
const PRODUCT_WITHDRAWN = packRow(3, { productRemoved: true });
const ALL = [ACTIVE, PACK_WITHDRAWN, PRODUCT_WITHDRAWN];

describe("getPackage", () => {
  it("returns an active pack with withdrawn false", async () => {
    expect(await getPackage(fakeClient(ALL), 1)).toEqual({
      packageId: 1,
      productId: 1001,
      gtin: "05901",
      availabilityCategory: "OTC",
      units: UNITS,
      holder: "Holder 1",
      withdrawn: false,
    });
  });

  it("returns a withdrawn pack of an active product with withdrawn true", async () => {
    expect(await getPackage(fakeClient(ALL), 2)).toEqual({
      packageId: 2,
      productId: 1002,
      gtin: "05902",
      availabilityCategory: "OTC",
      units: UNITS,
      holder: "Holder 2",
      withdrawn: true,
    });
  });

  it("returns a pack of a withdrawn product with withdrawn true", async () => {
    expect(await getPackage(fakeClient(ALL), 3)).toMatchObject({ packageId: 3, holder: "Holder 3", withdrawn: true });
  });

  it("returns null for a pack that does not exist", async () => {
    expect(await getPackage(fakeClient(ALL), 4)).toBeNull();
  });
});

describe("getPackages", () => {
  it("finds active and withdrawn packs and leaves out only the missing one", async () => {
    const packs = await getPackages(fakeClient(ALL), [1, 2, 3, 4, 2]);
    expect([...packs.keys()].sort()).toEqual([1, 2, 3]);
    expect(packs.get(1)).toMatchObject({ packageId: 1, productId: 1001, holder: "Holder 1", withdrawn: false });
    expect(packs.get(2)).toMatchObject({ packageId: 2, productId: 1002, holder: "Holder 2", withdrawn: true });
    expect(packs.get(3)).toMatchObject({ packageId: 3, productId: 1003, holder: "Holder 3", withdrawn: true });
  });

  it("returns an empty map for no ids", async () => {
    expect((await getPackages(fakeClient(ALL), [])).size).toBe(0);
  });
});

describe("getVariantPackages", () => {
  const rpcRow = {
    package_id: 7,
    product_id: 70,
    gtin: null,
    availability_category: "Rp",
    units: null,
    marketing_authorization_holder: "Holder 70",
  };

  it("maps a row without the withdrawn column (database before the migration) to withdrawn false", async () => {
    expect(await getVariantPackages(fakeClient([], [rpcRow]), 70)).toEqual([
      {
        packageId: 7,
        productId: 70,
        gtin: null,
        availabilityCategory: "Rp",
        units: [],
        holder: "Holder 70",
        withdrawn: false,
      },
    ]);
  });

  it("keeps the withdrawn column of the new database", async () => {
    const packs = await getVariantPackages(
      fakeClient(
        [],
        [
          { ...rpcRow, withdrawn: false },
          { ...rpcRow, package_id: 8, withdrawn: true },
        ],
      ),
      70,
    );
    expect(packs.map(({ packageId, withdrawn }) => ({ packageId, withdrawn }))).toEqual([
      { packageId: 7, withdrawn: false },
      { packageId: 8, withdrawn: true },
    ]);
  });
});
