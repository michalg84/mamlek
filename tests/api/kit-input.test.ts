// Input boundaries of the kit endpoints, as a black box over HTTP on a running app: POST /api/kit,
// POST /api/kit/import, GET /api/kit/check, and PATCH and DELETE /api/kit/[id]. Every rejected request must (1) get the expected 4xx, never a 500,
// (2) write nothing, (3) leak nothing from the inside of the server. Every boundary is tested from both sides: the
// value just past it is rejected, the value on it is accepted. The boundaries come from the sources, not from the
// validation schema in the code:
//   - quantity: the database column is integer >= 0 (kit_items migration); the pack size is the cap when the pack has
//     one (add-medicine-to-kit plan, contract of POST /api/kit); 100000 is the cap otherwise (F1 of that change's
//     review: a bound far below the integer limit);
//   - expiry: month 1-12 and a year range of 2000-2100 (same contract); the precision is always month;
//   - ids: positive integers that exist in the registry as packs, active or withdrawn (the pack or its product): a
//     medicine withdrawn from the registry can still be kept in the kit (withdrawn-medicine-in-kit plan, phase 2);
//   - import page: 1 to 30 items, all stored or none (csv-kit-import plan, phase 2: one page of the approval screen);
//   - edit (kit-browse-edit plan, phase 1): a key that is absent leaves the stored value, null clears it; the quantity
//     cap follows the pack the item will be on (the stored pack when it does not change, even a withdrawn one); the
//     new pack must be a pack of the same medicine, active or withdrawn (withdrawn-medicine-in-kit plan, phase 2); the
//     id in the path is digits only.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  expectNoInternals,
  kitRowCount,
  kitRowsById,
  loadBoundaryData,
  send,
  sendJson,
  signUpAndSignIn,
  type BoundaryData,
  type Jar,
  type Reply,
} from "./helpers";

const KIT = "/api/kit";
const IMPORT = "/api/kit/import";
const CHECK = "/api/kit/check";
const UNKNOWN_ID = 999_999_999_999;
// Typed by hand from the csv-kit-import plan (phase 2), not imported from the code under test.
const PAGE_SIZE = 30;

let email: string;
let jar: Jar;
let data: BoundaryData;

beforeAll(async () => {
  data = await loadBoundaryData();
  ({ email, jar } = await signUpAndSignIn("input"));
});

/** Sends the request and asserts the three things every rejected request must satisfy. */
async function expectRejected(status: number, send_: () => Promise<Reply>): Promise<Reply> {
  const before = await kitRowCount(email);
  const reply = await send_();
  expect(reply.status, reply.body.slice(0, 200)).toBe(status);
  expect(await kitRowCount(email)).toBe(before);
  expectNoInternals(reply.body);
  return reply;
}

/** Sends the request and asserts that it stored exactly one row. */
async function expectStored(body: unknown): Promise<void> {
  const before = await kitRowCount(email);
  const reply = await sendJson(KIT, body, jar);
  expect(reply.status, reply.body.slice(0, 200)).toBe(201);
  expect(await kitRowCount(email)).toBe(before + 1);
}

type Case = [name: string, body: (d: BoundaryData) => unknown];

describe("POST /api/kit: wrong request shape", () => {
  it.each([
    ["JSON with Content-Type text/plain", "text/plain"],
    ["no Content-Type", undefined],
  ])("%s gets 415", async (_name, contentType) => {
    await expectRejected(415, () =>
      send(KIT, { method: "POST", body: JSON.stringify({ packageId: data.sized.packageId }), contentType, jar }),
    );
  });

  it.each([["{"], ["[]"], ["null"], ['"x"']])("body %s gets 400", async (body) => {
    await expectRejected(400, () => sendJson(KIT, body, jar));
  });

  it.each([["userId"], ["user_id"]])("unknown key %s gets 400 (the owner comes from the session)", async (key) => {
    await expectRejected(400, () => sendJson(KIT, { packageId: data.sized.packageId, [key]: "x" }, jar));
  });

  // The route has no size limit of its own: the unknown key is what rejects it. The case proves that a large body is
  // read and refused without a 500 or a write, not that size itself is checked.
  it("an oversized body (100 kB in an unknown key) gets 400 and writes nothing", async () => {
    await expectRejected(400, () =>
      sendJson(KIT, { packageId: data.sized.packageId, padding: "x".repeat(100_000) }, jar),
    );
  });
});

describe("POST /api/kit: packageId", () => {
  const cases: Case[] = [
    ["missing", () => ({})],
    ["zero", () => ({ packageId: 0 })],
    ["negative", () => ({ packageId: -1 })],
    ["fractional", () => ({ packageId: 1.5 })],
    ["a string", (d) => ({ packageId: String(d.sized.packageId) })],
    ["null", () => ({ packageId: null })],
    ["2^53", () => ({ packageId: 2 ** 53 })],
    ["1e20", () => ({ packageId: 1e20 })],
  ];

  it.each(cases)("%s gets 400", async (_name, body) => {
    await expectRejected(400, () => sendJson(KIT, body(data), jar));
  });

  it("not in the registry gets 400 Package not found", async () => {
    const reply = await expectRejected(400, () => sendJson(KIT, { packageId: UNKNOWN_ID }, jar));
    expect((JSON.parse(reply.body) as { error?: string }).error).toBe("Package not found");
  });

  // A medicine withdrawn from the registry can still be in the cabinet, so its pack is accepted.
  it.each([
    ["a withdrawn pack", () => data.withdrawnPackage.packageId],
    ["a pack of a withdrawn product", () => data.withdrawnProductPackage.packageId],
  ])("%s gets 201 and the row is stored on it", async (_name, target) => {
    const packageId = target();
    const before = await kitRowCount(email);
    const reply = await sendJson(KIT, { packageId, quantity: 1 }, jar);
    expect(reply.status, reply.body.slice(0, 200)).toBe(201);
    const { id } = JSON.parse(reply.body) as { id: number };
    expect(await kitRowCount(email)).toBe(before + 1);
    expect(await kitRowsById([id])).toMatchObject([{ id, owner: email, packageId, quantity: 1 }]);
  });
});

describe("POST /api/kit: quantity", () => {
  const rejected: Case[] = [
    ["negative", (d) => ({ packageId: d.unsized.packageId, quantity: -1 })],
    ["fractional", (d) => ({ packageId: d.unsized.packageId, quantity: 1.5 })],
    ["a string", (d) => ({ packageId: d.unsized.packageId, quantity: "5" })],
    ["a boolean", (d) => ({ packageId: d.unsized.packageId, quantity: true })],
    ["above 100000 on a pack without a size", (d) => ({ packageId: d.unsized.packageId, quantity: 100_001 })],
    ["above the pack size", (d) => ({ packageId: d.sized.packageId, quantity: d.sized.size + 1 })],
  ];

  it.each(rejected)("%s gets 400", async (_name, body) => {
    await expectRejected(400, () => sendJson(KIT, body(data), jar));
  });

  it("zero is stored", async () => {
    await expectStored({ packageId: data.sized.packageId, quantity: 0 });
  });

  it("exactly the pack size is stored", async () => {
    await expectStored({ packageId: data.sized.packageId, quantity: data.sized.size });
  });

  it("exactly 100000 is stored on a pack without a size", async () => {
    await expectStored({ packageId: data.unsized.packageId, quantity: 100_000 });
  });
});

describe("POST /api/kit: expiry", () => {
  const rejected: Case[] = [
    ["month 0", (d) => ({ packageId: d.sized.packageId, expiry: { month: 0, year: 2030 } })],
    ["month 13", (d) => ({ packageId: d.sized.packageId, expiry: { month: 13, year: 2030 } })],
    ["year 1999", (d) => ({ packageId: d.sized.packageId, expiry: { month: 6, year: 1999 } })],
    ["year 2101", (d) => ({ packageId: d.sized.packageId, expiry: { month: 6, year: 2101 } })],
    ["an extra key day", (d) => ({ packageId: d.sized.packageId, expiry: { month: 6, year: 2030, day: 1 } })],
    ["a string", (d) => ({ packageId: d.sized.packageId, expiry: "2026-10" })],
  ];

  it.each(rejected)("%s gets 400", async (_name, body) => {
    await expectRejected(400, () => sendJson(KIT, body(data), jar));
  });

  it.each([
    ["the first month of the range", { month: 1, year: 2000 }],
    ["the last month of the range", { month: 12, year: 2100 }],
  ])("%s is stored", async (_name, expiry) => {
    await expectStored({ packageId: data.sized.packageId, expiry });
  });

  it("a pack with neither quantity nor expiry is stored", async () => {
    await expectStored({ packageId: data.sized.packageId });
  });
});

/** `count` copies of the same item (a page of the import may hold the same pack many times). */
function itemsOf<T>(count: number, item: T): T[] {
  return Array.from({ length: count }, () => item);
}

/**
 * Sends one import page and asserts that it stored exactly one row per item, and that the answered ids are those rows
 * in the order of the items (same pack and quantity, owned by the session's account).
 */
async function expectImported(
  items: { packageId: number; quantity?: number | null; expiry?: { month: number; year: number } | null }[],
): Promise<void> {
  const before = await kitRowCount(email);
  const reply = await sendJson(IMPORT, { items }, jar);
  expect(reply.status, reply.body.slice(0, 200)).toBe(201);
  expect(await kitRowCount(email)).toBe(before + items.length);
  const { ids } = JSON.parse(reply.body) as { ids: number[] };
  const rows = (await kitRowsById(ids)).map(({ id, owner, packageId, quantity }) => ({
    id,
    owner,
    packageId,
    quantity,
  }));
  expect(rows).toEqual(
    items.map((item, i) => ({ id: ids[i], owner: email, packageId: item.packageId, quantity: item.quantity ?? null })),
  );
}

/** Rejects the page because of one item and asserts that the reply names that item. */
async function expectItemRejected(items: unknown[], index: number): Promise<void> {
  const reply = await expectRejected(400, () => sendJson(IMPORT, { items }, jar));
  expect((JSON.parse(reply.body) as { index?: number }).index).toBe(index);
}

describe("POST /api/kit/import: wrong request shape", () => {
  it.each([
    ["JSON with Content-Type text/plain", "text/plain"],
    ["no Content-Type", undefined],
  ])("%s gets 415", async (_name, contentType) => {
    await expectRejected(415, () =>
      send(IMPORT, {
        method: "POST",
        body: JSON.stringify({ items: [{ packageId: data.sized.packageId }] }),
        contentType,
        jar,
      }),
    );
  });

  it.each([["{"], ["[]"], ["null"], ['"x"'], ["{}"], ['{"items":"x"}'], ['{"items":{}}'], ['{"items":null}']])(
    "body %s gets 400",
    async (body) => {
      await expectRejected(400, () => sendJson(IMPORT, body, jar));
    },
  );

  it.each([["userId"], ["user_id"]])("unknown key %s next to items gets 400", async (key) => {
    await expectRejected(400, () =>
      sendJson(IMPORT, { items: [{ packageId: data.sized.packageId }], [key]: "x" }, jar),
    );
  });

  it.each([["userId"], ["user_id"]])(
    "unknown key %s in an item gets 400 (the owner comes from the session)",
    async (key) => {
      await expectRejected(400, () =>
        sendJson(IMPORT, { items: [{ packageId: data.sized.packageId, [key]: "x" }] }, jar),
      );
    },
  );
});

describe("POST /api/kit/import: number of items", () => {
  it("0 items get 400", async () => {
    await expectRejected(400, () => sendJson(IMPORT, { items: [] }, jar));
  });

  it(`${PAGE_SIZE + 1} items get 400`, async () => {
    await expectRejected(400, () =>
      sendJson(IMPORT, { items: itemsOf(PAGE_SIZE + 1, { packageId: data.sized.packageId }) }, jar),
    );
  });

  it("1 item is stored", async () => {
    await expectImported([{ packageId: data.sized.packageId }]);
  });

  it(`${PAGE_SIZE} items are stored`, async () => {
    await expectImported(itemsOf(PAGE_SIZE, { packageId: data.sized.packageId }));
  });
});

describe("POST /api/kit/import: items", () => {
  // The item rules of POST /api/kit, applied to the second item so that the check is not limited to the first one.
  const rejected: Case[] = [
    ["packageId a string", (d) => ({ packageId: String(d.sized.packageId) })],
    ["packageId zero", () => ({ packageId: 0 })],
    ["quantity negative", (d) => ({ packageId: d.unsized.packageId, quantity: -1 })],
    ["quantity a string", (d) => ({ packageId: d.unsized.packageId, quantity: "5" })],
    ["quantity above 100000 on a pack without a size", (d) => ({ packageId: d.unsized.packageId, quantity: 100_001 })],
    ["expiry month 13", (d) => ({ packageId: d.sized.packageId, expiry: { month: 13, year: 2030 } })],
    ["expiry year 1999", (d) => ({ packageId: d.sized.packageId, expiry: { month: 6, year: 1999 } })],
    [
      "expiry with an extra key day",
      (d) => ({ packageId: d.sized.packageId, expiry: { month: 6, year: 2030, day: 1 } }),
    ],
  ];

  it.each(rejected)("%s gets 400", async (_name, item) => {
    await expectRejected(400, () =>
      sendJson(IMPORT, { items: [{ packageId: data.sized.packageId }, item(data)] }, jar),
    );
  });

  const rejectedAfterLookup: Case[] = [
    ["a pack not in the registry", () => ({ packageId: UNKNOWN_ID })],
    ["a quantity above the pack size", (d) => ({ packageId: d.sized.packageId, quantity: d.sized.size + 1 })],
  ];

  it.each(rejectedAfterLookup)("%s gets 400 naming the item", async (_name, item) => {
    await expectItemRejected([{ packageId: data.sized.packageId }, item(data)], 1);
  });

  it("a pack not in the registry gets 400 Package not found with its index", async () => {
    const reply = await expectRejected(400, () =>
      sendJson(IMPORT, { items: [{ packageId: data.sized.packageId }, { packageId: UNKNOWN_ID }] }, jar),
    );
    expect(JSON.parse(reply.body)).toEqual({ error: "Package not found", index: 1 });
  });

  // A medicine withdrawn from the registry can still be in the cabinet, so its pack is imported like an active one.
  it.each([
    ["a withdrawn pack", () => data.withdrawnPackage.packageId],
    ["a pack of a withdrawn product", () => data.withdrawnProductPackage.packageId],
  ])("%s is stored", async (_name, target) => {
    await expectImported([{ packageId: data.sized.packageId }, { packageId: target(), quantity: 1 }]);
  });

  it(`${PAGE_SIZE - 1} good items and a bad last one store nothing (all or none)`, async () => {
    const good = itemsOf(PAGE_SIZE - 1, { packageId: data.sized.packageId, quantity: 1 });
    await expectItemRejected(
      [...good, { packageId: data.sized.packageId, quantity: data.sized.size + 1 }],
      PAGE_SIZE - 1,
    );
  });

  it("items on every boundary are stored together", async () => {
    await expectImported([
      { packageId: data.sized.packageId, quantity: 0 },
      { packageId: data.sized.packageId, quantity: data.sized.size },
      { packageId: data.unsized.packageId, quantity: 100_000 },
      { packageId: data.sized.packageId, expiry: { month: 1, year: 2000 } },
      { packageId: data.sized.packageId, expiry: { month: 12, year: 2100 } },
      { packageId: data.sized.packageId, quantity: null, expiry: null },
    ]);
  });
});

describe("GET /api/kit/check: product", () => {
  it.each([
    ["missing", ""],
    ["empty", "?product="],
    ["not a number", "?product=abc"],
    ["negative", "?product=-1"],
    ["zero", "?product=0"],
    ["fractional", "?product=1.5"],
    ["exponent notation", "?product=1e3"],
    ["beyond any id", "?product=99999999999999999999"],
  ])("%s gets 400", async (_name, query) => {
    await expectRejected(400, () => send(CHECK + query, { jar }));
  });

  it("an unknown product gets 404", async () => {
    await expectRejected(404, () => send(`${CHECK}?product=${UNKNOWN_ID}`, { jar }));
  });

  it("a known product gets 200", async () => {
    const reply = await send(`${CHECK}?product=${data.sized.productId}`, { jar });
    expect(reply.status).toBe(200);
  });
});

// --- PATCH and DELETE /api/kit/[id] ------------------------------------------------------------------------------

const EDIT_BAD_IDS = [["abc"], ["0"], ["-1"], ["1.5"], ["01"], ["1e3"], ["9".repeat(500)]];

/** Adds a row through the app and returns its id. */
async function addRow(body: unknown): Promise<number> {
  const reply = await sendJson(KIT, body, jar);
  expect(reply.status, reply.body.slice(0, 200)).toBe(201);
  return (JSON.parse(reply.body) as { id: number }).id;
}

function patch(id: number | string, body: unknown): Promise<Reply> {
  return sendJson(`${KIT}/${id}`, body, jar, "PATCH");
}

/** The only row with this id, as the database holds it. */
async function rowOf(id: number) {
  const rows = await kitRowsById([id]);
  expect(rows).toHaveLength(1);
  return rows[0];
}

/** PATCH that must be refused: the expected 4xx, the row unchanged (same columns before and after), no internals. */
async function expectPatchRejected(status: number, id: number | string, body: unknown): Promise<Reply> {
  const ids = typeof id === "number" ? [id] : [];
  const beforeRows = await kitRowsById(ids);
  const beforeCount = await kitRowCount(email);
  const reply = await patch(id, body);
  expect(reply.status, reply.body.slice(0, 200)).toBe(status);
  expect(await kitRowsById(ids)).toEqual(beforeRows);
  expect(await kitRowCount(email)).toBe(beforeCount);
  expectNoInternals(reply.body);
  return reply;
}

/** PATCH that must be accepted; returns the `item` of the reply. */
async function expectPatched(id: number, body: unknown) {
  const reply = await patch(id, body);
  expect(reply.status, reply.body.slice(0, 200)).toBe(200);
  const { item } = JSON.parse(reply.body) as {
    item: { id: number; packageId: number; quantity: number | null; expiresOn: string | null };
  };
  expect(item.id).toBe(id);
  return item;
}

describe("PATCH /api/kit/[id]: wrong request shape", () => {
  let id: number;
  beforeAll(async () => {
    id = await addRow({ packageId: data.sized.packageId, quantity: 1 });
  });

  it.each([
    ["JSON with Content-Type text/plain", "text/plain"],
    ["no Content-Type", undefined],
  ])("%s gets 415", async (_name, contentType) => {
    const before = await kitRowsById([id]);
    const reply = await send(`${KIT}/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity: 2 }),
      contentType,
      jar,
    });
    expect(reply.status).toBe(415);
    expect(await kitRowsById([id])).toEqual(before);
    expectNoInternals(reply.body);
  });

  it.each([["{"], ["[]"], ["null"], ['"x"'], ["{}"]])("body %s gets 400", async (body) => {
    await expectPatchRejected(400, id, body);
  });

  it.each([["userId"], ["user_id"], ["extra"]])(
    "unknown key %s gets 400 (the owner comes from the session)",
    async (key) => {
      await expectPatchRejected(400, id, { quantity: 2, [key]: "x" });
    },
  );

  it("packageId null gets 400", async () => {
    await expectPatchRejected(400, id, { packageId: null });
  });

  it.each(EDIT_BAD_IDS)("id %s in the path gets 400", async (badId) => {
    await expectPatchRejected(400, badId, { quantity: 2 });
  });

  it("an id that is no row gets 404", async () => {
    await expectPatchRejected(404, UNKNOWN_ID, { quantity: 2 });
  });
});

describe("PATCH /api/kit/[id]: quantity", () => {
  it.each([
    ["negative", -1],
    ["fractional", 1.5],
    ["a string", "5"],
    ["a boolean", true],
  ])("%s gets 400", async (_name, quantity) => {
    const id = await addRow({ packageId: data.sized.packageId, quantity: 1 });
    await expectPatchRejected(400, id, { quantity });
  });

  it("above the pack size gets 400", async () => {
    const id = await addRow({ packageId: data.sized.packageId, quantity: 1 });
    await expectPatchRejected(400, id, { quantity: data.sized.size + 1 });
  });

  it("above 100000 on a pack without a size gets 400", async () => {
    const id = await addRow({ packageId: data.unsized.packageId, quantity: 1 });
    await expectPatchRejected(400, id, { quantity: 100_001 });
  });

  it("zero is stored", async () => {
    const id = await addRow({ packageId: data.sized.packageId, quantity: 1 });
    expect((await expectPatched(id, { quantity: 0 })).quantity).toBe(0);
    expect((await rowOf(id)).quantity).toBe(0);
  });

  it("exactly the pack size is stored", async () => {
    const id = await addRow({ packageId: data.sized.packageId, quantity: 1 });
    expect((await expectPatched(id, { quantity: data.sized.size })).quantity).toBe(data.sized.size);
    expect((await rowOf(id)).quantity).toBe(data.sized.size);
  });

  it("exactly 100000 is stored on a pack without a size", async () => {
    const id = await addRow({ packageId: data.unsized.packageId, quantity: 1 });
    expect((await expectPatched(id, { quantity: 100_000 })).quantity).toBe(100_000);
    expect((await rowOf(id)).quantity).toBe(100_000);
  });
});

describe("PATCH /api/kit/[id]: expiry", () => {
  it.each([
    ["month 0", { month: 0, year: 2030 }],
    ["month 13", { month: 13, year: 2030 }],
    ["year 1999", { month: 6, year: 1999 }],
    ["year 2101", { month: 6, year: 2101 }],
    ["an extra key day", { month: 6, year: 2030, day: 1 }],
    ["a string", "2026-10"],
  ])("%s gets 400", async (_name, expiry) => {
    const id = await addRow({ packageId: data.sized.packageId, quantity: 1 });
    await expectPatchRejected(400, id, { expiry });
  });

  it.each([
    ["the first month of the range", { month: 1, year: 2000 }, "2000-01-31"],
    ["the last month of the range", { month: 12, year: 2100 }, "2100-12-31"],
    ["a leap February", { month: 2, year: 2028 }, "2028-02-29"],
  ])("%s is stored as the last day of the month", async (_name, expiry, expiresOn) => {
    const id = await addRow({ packageId: data.sized.packageId });
    await expectPatched(id, { expiry });
    expect(await rowOf(id)).toMatchObject({ expiresOn, expiryPrecision: "month" });
  });
});

describe("PATCH /api/kit/[id]: only the sent fields change", () => {
  let id: number;
  beforeEach(async () => {
    id = await addRow({ packageId: data.sized.packageId, quantity: 3, expiry: { month: 6, year: 2030 } });
    expect(await rowOf(id)).toMatchObject({
      packageId: data.sized.packageId,
      quantity: 3,
      expiresOn: "2030-06-30",
      expiryPrecision: "month",
    });
  });

  it("{ quantity } keeps the pack, the date and the precision", async () => {
    await expectPatched(id, { quantity: 4 });
    expect(await rowOf(id)).toMatchObject({
      packageId: data.sized.packageId,
      quantity: 4,
      expiresOn: "2030-06-30",
      expiryPrecision: "month",
    });
  });

  it("{ expiry: null } clears the date and the precision and keeps the quantity", async () => {
    await expectPatched(id, { expiry: null });
    expect(await rowOf(id)).toMatchObject({
      packageId: data.sized.packageId,
      quantity: 3,
      expiresOn: null,
      expiryPrecision: null,
    });
  });

  it("{ quantity: null } makes the quantity unknown and keeps the date", async () => {
    await expectPatched(id, { quantity: null });
    expect(await rowOf(id)).toMatchObject({
      packageId: data.sized.packageId,
      quantity: null,
      expiresOn: "2030-06-30",
      expiryPrecision: "month",
    });
  });

  it("{ expiry } sets a new date and keeps the quantity", async () => {
    await expectPatched(id, { expiry: { month: 2, year: 2031 } });
    expect(await rowOf(id)).toMatchObject({ quantity: 3, expiresOn: "2031-02-28", expiryPrecision: "month" });
  });
});

describe("PATCH /api/kit/[id]: change of the pack", () => {
  // The siblings are two active packs of one medicine, `small` and `large` by size (large.size > small.size).
  it("to a sibling pack of the same medicine gets 200 and the row moves", async () => {
    const { small, large } = data.siblings;
    const id = await addRow({ packageId: small.packageId });
    expect((await expectPatched(id, { packageId: large.packageId })).packageId).toBe(large.packageId);
    expect((await rowOf(id)).packageId).toBe(large.packageId);
  });

  it.each([
    ["a pack of another variant", () => data.otherVariant.packageId],
    ["a withdrawn pack of another variant", () => data.otherVariantWithdrawn.packageId],
    ["a pack not in the registry", () => UNKNOWN_ID],
  ])("to %s gets 400", async (_name, target) => {
    const id = await addRow({ packageId: data.siblings.small.packageId });
    await expectPatchRejected(400, id, { packageId: target() });
  });

  // A withdrawn medicine can be kept, so a withdrawn pack of the same medicine is a valid target.
  it("to a withdrawn pack of the same medicine gets 200 and the row moves", async () => {
    const target = data.siblingWithdrawn.packageId;
    const id = await addRow({ packageId: data.siblings.small.packageId });
    expect((await expectPatched(id, { packageId: target })).packageId).toBe(target);
    expect((await rowOf(id)).packageId).toBe(target);
  });

  it("from a pack of a withdrawn product to another pack of it gets 200 and the row moves", async () => {
    const { from, to } = data.withdrawnProductPair;
    const id = await addRow({ packageId: from.packageId });
    expect((await expectPatched(id, { packageId: to.packageId })).packageId).toBe(to.packageId);
    expect((await rowOf(id)).packageId).toBe(to.packageId);
  });

  it("with a quantity above the new pack's size gets 400, on the new size it gets 200", async () => {
    const { small, large } = data.siblings;
    const id = await addRow({ packageId: large.packageId });
    await expectPatchRejected(400, id, { packageId: small.packageId, quantity: small.size + 1 });
    await expectPatched(id, { packageId: small.packageId, quantity: small.size });
    expect(await rowOf(id)).toMatchObject({ packageId: small.packageId, quantity: small.size });
  });

  it("without a quantity checks the stored one against the new pack (above gets 400, on the size gets 200)", async () => {
    const { small, large } = data.siblings;
    const above = await addRow({ packageId: large.packageId, quantity: small.size + 1 });
    await expectPatchRejected(400, above, { packageId: small.packageId });

    const on = await addRow({ packageId: large.packageId, quantity: small.size });
    await expectPatched(on, { packageId: small.packageId });
    expect((await rowOf(on)).packageId).toBe(small.packageId);
  });

  it("with quantity null clears a stored quantity that would not fit the new pack", async () => {
    const { small, large } = data.siblings;
    const id = await addRow({ packageId: large.packageId, quantity: small.size + 1 });
    await expectPatched(id, { packageId: small.packageId, quantity: null });
    expect(await rowOf(id)).toMatchObject({ packageId: small.packageId, quantity: null });
  });

  it("to the stored pack is no change and needs no check of the pack", async () => {
    const { small } = data.siblings;
    const id = await addRow({ packageId: small.packageId, quantity: 1 });
    await expectPatched(id, { packageId: small.packageId });
    expect((await rowOf(id)).packageId).toBe(small.packageId);
  });
});

describe("PATCH /api/kit/[id]: an item on a withdrawn pack", () => {
  // The item is added through the app (a withdrawn pack is accepted). The cap is the size of the pack the item is on,
  // withdrawn or not: both sides of it are tested, so skipping the cap for a withdrawn pack is caught too.
  let id: number;
  beforeEach(async () => {
    id = await addRow({ packageId: data.withdrawnSized.packageId, quantity: 1 });
  });

  it("a quantity on the pack size gets 200", async () => {
    const { size } = data.withdrawnSized;
    expect((await expectPatched(id, { quantity: size })).quantity).toBe(size);
    expect((await rowOf(id)).quantity).toBe(size);
  });

  it("a quantity above the pack size gets 400", async () => {
    await expectPatchRejected(400, id, { quantity: data.withdrawnSized.size + 1 });
  });

  it("the same packageId gets 200 (it is no change)", async () => {
    await expectPatched(id, { packageId: data.withdrawnSized.packageId, quantity: 2 });
    expect(await rowOf(id)).toMatchObject({ packageId: data.withdrawnSized.packageId, quantity: 2 });
  });
});

describe("DELETE /api/kit/[id]", () => {
  function del(id: number | string): Promise<Reply> {
    return send(`${KIT}/${id}`, { method: "DELETE", jar });
  }

  it.each(EDIT_BAD_IDS)("id %s in the path gets 400 and deletes nothing", async (badId) => {
    const before = await kitRowCount(email);
    const reply = await del(badId);
    expect(reply.status).toBe(400);
    expect(await kitRowCount(email)).toBe(before);
    expectNoInternals(reply.body);
  });

  it("an id that is no row gets 404 and deletes nothing", async () => {
    const before = await kitRowCount(email);
    const reply = await del(UNKNOWN_ID);
    expect(reply.status).toBe(404);
    expect(await kitRowCount(email)).toBe(before);
    expectNoInternals(reply.body);
  });

  it("an own row gets 204 and is gone, the second try gets 404", async () => {
    const id = await addRow({ packageId: data.sized.packageId });
    const before = await kitRowCount(email);

    const first = await del(id);
    expect(first.status).toBe(204);
    expect(first.body).toBe("");
    expect(await kitRowsById([id])).toEqual([]);
    expect(await kitRowCount(email)).toBe(before - 1);

    const second = await del(id);
    expect(second.status).toBe(404);
    expectNoInternals(second.body);
    expect(await kitRowCount(email)).toBe(before - 1);
  });
});
