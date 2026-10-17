// Input boundaries of the kit endpoints, as a black box over HTTP on a running app: POST /api/kit and
// GET /api/kit/check. Every rejected request must (1) get the expected 4xx, never a 500, (2) write nothing, (3) leak
// nothing from the inside of the server. Every boundary is tested from both sides: the value just past it is rejected,
// the value on it is accepted. The boundaries come from the sources, not from the validation schema in the code:
//   - quantity: the database column is integer >= 0 (kit_items migration); the pack size is the cap when the pack has
//     one (add-medicine-to-kit plan, contract of POST /api/kit); 100000 is the cap otherwise (F1 of that change's
//     review: a bound far below the integer limit);
//   - expiry: month 1-12 and a year range of 2000-2100 (same contract); the precision is always month;
//   - ids: positive integers that exist in the registry as active packs of active products.
import { beforeAll, describe, expect, it } from "vitest";
import {
  expectNoInternals,
  kitRowCount,
  loadBoundaryData,
  send,
  sendJson,
  signUpAndSignIn,
  type BoundaryData,
  type Jar,
  type Reply,
} from "./helpers";

const KIT = "/api/kit";
const CHECK = "/api/kit/check";
const UNKNOWN_ID = 999_999_999_999;

let email: string;
let jar: Jar;
let data: BoundaryData;

beforeAll(async () => {
  data = await loadBoundaryData();
  ({ email, jar } = await signUpAndSignIn("input"));
});

/** Sends the request and asserts the three things every rejected request must satisfy. */
async function expectRejected(status: number, send_: () => Promise<Reply>): Promise<void> {
  const before = await kitRowCount(email);
  const reply = await send_();
  expect(reply.status, reply.body.slice(0, 200)).toBe(status);
  expect(await kitRowCount(email)).toBe(before);
  expectNoInternals(reply.body);
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
