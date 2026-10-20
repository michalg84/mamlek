// Tests of who can reach the household kit (public.kit_items) and what the database itself refuses, on a real local
// database, on synthetic accounts and packages that are rolled back. The expected values come from the kit_items
// migration (owner-only policies per operation, no grants for anon, column constraints), the test plan risks #4 and #6
// and the accepted gap F2 of add-medicine-to-kit (the package-size and date limits live only in the API), not from
// running the code.
import type pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { World, actAs, actAsAnon, actAsOwner, connectLocal, expectSqlError } from "./medicine-check-fixtures";

const w = new World();

const medicine = w.product({
  name: "Kitaccess",
  strength: "10 mg",
  form: "tabletki",
  commonName: "Kitaccessum",
  substances: ["Kitaccessum"],
});
// A package with a known size: ten sachets.
const sized = w.product({
  name: "Sizedpack",
  strength: "5 mg",
  form: "saszetki",
  commonName: "Sizedpackum",
  substances: ["Sizedpackum"],
  units: [{ count: "10", kind: "sasz." }],
});
const withdrawnPackage = w.extraPackage(medicine, { removed: true });

const userA = w.user();
const userB = w.user();
const rowA = w.kitItem(userA, medicine.packageId, { quantity: 5 });

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

/** The row of account A as the table owner sees it (RLS does not apply). */
async function rowAsOwner(): Promise<{ user_id: string; quantity: number | null } | undefined> {
  await actAsOwner(client);
  const { rows } = await client.query<{ user_id: string; quantity: number | null }>(
    "select user_id, quantity from kit_items where id = $1",
    [rowA.id],
  );
  return rows[0];
}

describe("kit_items isolation: account B against the row of account A", () => {
  it("B does not see A's row by id or in an unfiltered select", async () => {
    await actAs(client, userB);

    const byId = await client.query("select id from kit_items where id = $1", [rowA.id]);
    const all = await client.query("select id from kit_items");

    expect(byId.rowCount).toBe(1);
    expect(all.rowCount).toBe(0);
  });

  it("B cannot update A's row (0 rows touched, row unchanged)", async () => {
    await actAs(client, userB);

    const result = await client.query("update kit_items set quantity = 99 where id = $1", [rowA.id]);

    expect(result.rowCount).toBe(0);
    expect(await rowAsOwner()).toEqual({ user_id: userA, quantity: 5 });
  });

  it("B cannot delete A's row (0 rows touched, row still there)", async () => {
    await actAs(client, userB);

    const result = await client.query("delete from kit_items where id = $1", [rowA.id]);

    expect(result.rowCount).toBe(0);
    expect(await rowAsOwner()).toEqual({ user_id: userA, quantity: 5 });
  });

  it("B cannot insert a row owned by A (row level security violation)", async () => {
    await actAs(client, userB);

    await expectSqlError(
      client,
      "insert into kit_items (user_id, package_id) values ($1, $2)",
      [userA, medicine.packageId],
      "42501",
    );
  });
});

describe("kit_items isolation: account A on its own row", () => {
  it("A sees its own row (so the cases above do not pass only because nothing is visible)", async () => {
    await actAs(client, userA);

    const { rows } = await client.query("select id::int as id from kit_items where id = $1", [rowA.id]);

    expect(rows).toEqual([{ id: rowA.id }]);
  });

  it("A cannot hand its row over to B by changing user_id", async () => {
    await actAs(client, userA);

    // No WHERE on purpose: a WHERE reads a column, which makes Postgres also check the select policy on the new row,
    // and that check alone would reject the change even if the update policy had lost its WITH CHECK.
    await expectSqlError(client, "update kit_items set user_id = $1", [userB], "42501");
    expect(await rowAsOwner()).toEqual({ user_id: userA, quantity: 5 });
  });

  it("an insert without user_id belongs to the caller (default auth.uid())", async () => {
    await actAs(client, userA);

    const { rows } = await client.query<{ user_id: string }>(
      "insert into kit_items (package_id) values ($1) returning user_id",
      [medicine.packageId],
    );

    expect(rows[0].user_id).toBe(userA);
  });
});

describe("kit_items without a session", () => {
  it.each([
    ["select", "select id from kit_items"],
    ["insert", "insert into kit_items (user_id, package_id) values ('00000000-0000-4000-8000-000000000001', 1)"],
    ["update", "update kit_items set quantity = 1"],
    ["delete", "delete from kit_items"],
  ])("anon cannot %s", async (_operation, sql) => {
    await actAsAnon(client);

    await expectSqlError(client, sql, [], "42501");
  });

  it("anon cannot call medicine_check", async () => {
    await actAsAnon(client);

    await expectSqlError(client, "select public.medicine_check($1::bigint)", [medicine.id], "42501");
  });

  it("anon cannot call registry_variant_packages", async () => {
    await actAsAnon(client);

    await expectSqlError(client, "select * from public.registry_variant_packages($1::bigint)", [medicine.id], "42501");
  });

  it("a signed-in account cannot truncate the table (TRUNCATE bypasses row level security)", async () => {
    await actAs(client, userA);

    await expectSqlError(client, "truncate kit_items", [], "42501");
  });
});

describe("kit_items column constraints", () => {
  const insertOwn =
    "insert into kit_items (package_id, quantity, expires_on, expiry_precision) values ($1, $2, $3, $4)";

  it("rejects a negative quantity", async () => {
    await actAs(client, userA);

    await expectSqlError(client, insertOwn, [medicine.packageId, -1, null, null], "23514");
  });

  it("rejects an expiry precision other than month or day", async () => {
    await actAs(client, userA);

    await expectSqlError(client, insertOwn, [medicine.packageId, null, "2026-10-31", "week"], "23514");
  });

  it("rejects a date without a precision", async () => {
    await actAs(client, userA);

    await expectSqlError(client, insertOwn, [medicine.packageId, null, "2026-10-31", null], "23514");
  });

  it("rejects a precision without a date", async () => {
    await actAs(client, userA);

    await expectSqlError(client, insertOwn, [medicine.packageId, null, null, "month"], "23514");
  });

  it("rejects a package that is not in the registry", async () => {
    await actAs(client, userA);

    await expectSqlError(client, insertOwn, [9_999_999_999, null, null, null], "23503");
  });
});

// The database does not enforce these limits: they live only in the API (F2 of add-medicine-to-kit, accepted and
// parked in the roadmap). The owner can bypass them through the data API on their own rows. These cases pin the gap:
// if one starts to fail, the gap was closed, and the case should move up to the constraints above.
describe("kit_items accepted gaps", () => {
  const insertOwn =
    "insert into kit_items (package_id, quantity, expires_on, expiry_precision) values ($1, $2, $3, $4)";

  it("known gap (Parked, F2): a quantity above the package size is accepted by the database", async () => {
    await actAs(client, userA);

    const result = await client.query(insertOwn, [sized.packageId, 999, null, null]);

    expect(result.rowCount).toBe(1);
  });

  it("known gap (Parked, F2): a withdrawn package is accepted by the database", async () => {
    await actAs(client, userA);

    const result = await client.query(insertOwn, [withdrawnPackage, null, null, null]);

    expect(result.rowCount).toBe(1);
  });

  it("known gap (Parked, F2): day precision is accepted by the database (the API only takes month)", async () => {
    await actAs(client, userA);

    const result = await client.query(insertOwn, [medicine.packageId, null, "2026-10-17", "day"]);

    expect(result.rowCount).toBe(1);
  });
});

describe("security definer guard", () => {
  // A security definer function runs with its owner's rights and skips row level security, so a function that reads
  // user data that way would let one account read another's kit. The list of exceptions is empty on purpose: adding a
  // function here is a deliberate decision that needs a reason written next to it, not a way to make this test pass.
  const ALLOWED: string[] = [];

  it("no function in public is security definer", async () => {
    await actAsOwner(client);

    const { rows } = await client.query<{ proname: string }>(
      `select p.proname
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef
        order by p.proname`,
    );

    expect(rows.map((r) => r.proname).filter((name) => !ALLOWED.includes(name))).toEqual([]);
  });
});
