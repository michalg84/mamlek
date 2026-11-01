// Input boundaries of the kit endpoints, as a black box over HTTP on a running app: POST /api/kit,
// POST /api/kit/import and GET /api/kit/check. Every rejected request must (1) get the expected 4xx, never a 500,
// (2) write nothing, (3) leak nothing from the inside of the server. Every boundary is tested from both sides: the
// value just past it is rejected, the value on it is accepted. The boundaries come from the sources, not from the
// validation schema in the code:
//   - quantity: the database column is integer >= 0 (kit_items migration); the pack size is the cap when the pack has
//     one (add-medicine-to-kit plan, contract of POST /api/kit); 100000 is the cap otherwise (F1 of that change's
//     review: a bound far below the integer limit);
//   - expiry: month 1-12 and a year range of 2000-2100 (same contract); the precision is always month;
//   - ids: positive integers that exist in the registry as active packs of active products;
//   - import page: 1 to 30 items, all stored or none (csv-kit-import plan, phase 2: one page of the approval screen).
import { beforeAll, describe, expect, it } from "vitest";
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
    ["not in the registry", () => ({ packageId: UNKNOWN_ID })],
    ["a withdrawn pack", (d) => ({ packageId: d.withdrawnPackage.packageId })],
    ["a pack of a withdrawn product", (d) => ({ packageId: d.withdrawnProductPackage.packageId })],
  ];

  it.each(cases)("%s gets 400", async (_name, body) => {
    await expectRejected(400, () => sendJson(KIT, body(data), jar));
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
  expect(await kitRowsById(ids)).toEqual(
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
    ["a withdrawn pack", (d) => ({ packageId: d.withdrawnPackage.packageId })],
    ["a pack of a withdrawn product", (d) => ({ packageId: d.withdrawnProductPackage.packageId })],
    ["a quantity above the pack size", (d) => ({ packageId: d.sized.packageId, quantity: d.sized.size + 1 })],
  ];

  it.each(rejectedAfterLookup)("%s gets 400 naming the item", async (_name, item) => {
    await expectItemRejected([{ packageId: data.sized.packageId }, item(data)], 1);
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
