// Who can reach the kit through the app's own routes, as a black box over HTTP on a running app. The expectations come
// from the risk (test plan #4): a call without a session gets nothing and is refused before its content is looked at,
// the owner of a row is the session and never the request, and one account never sees another account's kit.
import { beforeAll, describe, expect, it } from "vitest";
import {
  escapeHtml,
  expectNoInternals,
  kitRowCount,
  kitRowsById,
  loadBoundaryData,
  send,
  sendJson,
  signUpAndSignIn,
  userIdOf,
  type BoundaryData,
  type Jar,
} from "./helpers";

const KIT = "/api/kit";
const IMPORT = "/api/kit/import";
const CHECK = "/api/kit/check";

let data: BoundaryData;
let a: { email: string; jar: Jar };
let b: { email: string; jar: Jar };

beforeAll(async () => {
  data = await loadBoundaryData();
  a = await signUpAndSignIn("owner");
  b = await signUpAndSignIn("other");
});

describe("without a session", () => {
  it.each([
    ["a valid body", JSON.stringify({ packageId: 1 }), "application/json"],
    ["an invalid body", "{", "application/json"],
    ["a wrong Content-Type", JSON.stringify({ packageId: 1 }), "text/plain"],
  ])("POST /api/kit with %s gets 401 (never 400 or 415)", async (_name, body, contentType) => {
    const reply = await send(KIT, { method: "POST", body, contentType });

    expect(reply.status).toBe(401);
    expectNoInternals(reply.body);
  });

  it.each([
    ["a valid body", JSON.stringify({ items: [{ packageId: 1 }] }), "application/json"],
    ["an invalid body", "{", "application/json"],
    [
      "too many items",
      JSON.stringify({ items: Array.from({ length: 31 }, () => ({ packageId: 1 })) }),
      "application/json",
    ],
    ["a wrong Content-Type", JSON.stringify({ items: [{ packageId: 1 }] }), "text/plain"],
  ])("POST /api/kit/import with %s gets 401 (never 400 or 415)", async (_name, body, contentType) => {
    const reply = await send(IMPORT, { method: "POST", body, contentType });

    expect(reply.status).toBe(401);
    expectNoInternals(reply.body);
  });

  it.each([
    ["a valid body", JSON.stringify({ quantity: 1 }), "application/json"],
    ["an invalid body", "{", "application/json"],
    ["an empty object", "{}", "application/json"],
    ["a wrong Content-Type", JSON.stringify({ quantity: 1 }), "text/plain"],
  ])("PATCH /api/kit/[id] with %s gets 401 (never 400, 404 or 415)", async (_name, body, contentType) => {
    const reply = await send(`${KIT}/1`, { method: "PATCH", body, contentType });

    expect(reply.status).toBe(401);
    expectNoInternals(reply.body);
  });

  it.each([
    ["no body", undefined, undefined],
    ["a JSON body", JSON.stringify({ quantity: 1 }), "application/json"],
    ["a wrong Content-Type", "x", "text/plain"],
  ])("DELETE /api/kit/[id] with %s gets 401", async (_name, body, contentType) => {
    const reply = await send(`${KIT}/1`, { method: "DELETE", body, contentType });

    expect(reply.status).toBe(401);
    expectNoInternals(reply.body);
  });

  it("DELETE /api/kit/[id] with a bad id gets 401 (never 400)", async () => {
    const reply = await send(`${KIT}/abc`, { method: "DELETE" });

    expect(reply.status).toBe(401);
    expectNoInternals(reply.body);
  });

  it.each([
    ["a valid product", "?product=1"],
    ["an invalid product", "?product=abc"],
    ["no product", ""],
  ])("GET /api/kit/check with %s gets 401", async (_name, query) => {
    const reply = await send(CHECK + query);

    expect(reply.status).toBe(401);
    expectNoInternals(reply.body);
  });
});

describe("account B against the kit of account A", () => {
  // A's real id, so that the case still means something if the body ever accepts an owner field.
  it.each([["userId"], ["user_id"]])("B cannot name A as the owner of a new row (%s = A's id)", async (key) => {
    const before = await kitRowCount(a.email);

    const reply = await sendJson(KIT, { packageId: data.sized.packageId, [key]: await userIdOf(a.email) }, b.jar);

    expect(reply.status).toBe(400);
    expect(await kitRowCount(a.email)).toBe(before);
  });

  it("a row B adds belongs to B, not to A (the owner comes from the session)", async () => {
    const beforeA = await kitRowCount(a.email);
    const beforeB = await kitRowCount(b.email);

    const reply = await sendJson(KIT, { packageId: data.sized.packageId }, b.jar);

    expect(reply.status).toBe(201);
    expect(await kitRowCount(b.email)).toBe(beforeB + 1);
    expect(await kitRowCount(a.email)).toBe(beforeA);
  });

  it.each([["userId"], ["user_id"]])("B cannot name A as the owner of an imported row (%s = A's id)", async (key) => {
    const before = await kitRowCount(a.email);
    const beforeB = await kitRowCount(b.email);

    const reply = await sendJson(
      IMPORT,
      { items: [{ packageId: data.sized.packageId, [key]: await userIdOf(a.email) }] },
      b.jar,
    );

    expect(reply.status).toBe(400);
    expect(await kitRowCount(a.email)).toBe(before);
    expect(await kitRowCount(b.email)).toBe(beforeB);
  });

  it("rows B imports belong to B, not to A (the owner comes from the session)", async () => {
    const beforeA = await kitRowCount(a.email);
    const beforeB = await kitRowCount(b.email);

    const reply = await sendJson(
      IMPORT,
      { items: [{ packageId: data.sized.packageId }, { packageId: data.siblings.large.packageId }] },
      b.jar,
    );

    expect(reply.status).toBe(201);
    const { ids } = JSON.parse(reply.body) as { ids: number[] };
    expect((await kitRowsById(ids)).map((row) => row.owner)).toEqual([b.email, b.email]);
    expect(await kitRowCount(b.email)).toBe(beforeB + 2);
    expect(await kitRowCount(a.email)).toBe(beforeA);
  });

  it("another account opening /apteczka?dodano=<id of A's row> sees neither the confirmation nor A's medicine", async () => {
    // A third account with an empty kit, so that its own page cannot contain the medicine for another reason.
    const c = await signUpAndSignIn("viewer");
    // A's medicine is in A's kit both added one by one and imported: neither may reach C's page.
    const imported = await sendJson(IMPORT, { items: [{ packageId: data.sized.packageId }] }, a.jar);
    expect(imported.status).toBe(201);
    const added = await sendJson(KIT, { packageId: data.sized.packageId }, a.jar);
    expect(added.status).toBe(201);
    const { id } = JSON.parse(added.body) as { id: number };
    const name = escapeHtml(data.sized.productName).toLowerCase();

    // Positive control: the owner does see the confirmation and the name, so their absence below means something.
    const own = await send(`/apteczka?dodano=${id}`, { jar: a.jar });
    expect(own.status).toBe(200);
    expect(own.body).toContain("Dodano:");
    expect(own.body.toLowerCase()).toContain(name);

    const page = await send(`/apteczka?dodano=${id}`, { jar: c.jar });

    expect(page.status).toBe(200);
    expect(page.body).not.toContain("Dodano:");
    expect(page.body.toLowerCase()).not.toContain(name);
    expect(page.body).toContain("Apteczka jest pusta");
  });
});

describe("editing and deleting the kit of account A", () => {
  /** A fresh row of A with a known quantity, added through the app. */
  async function addRowOfA(): Promise<number> {
    const added = await sendJson(KIT, { packageId: data.sized.packageId, quantity: 1 }, a.jar);
    expect(added.status).toBe(201);
    return (JSON.parse(added.body) as { id: number }).id;
  }

  it("B cannot change A's row: PATCH gets 404 and the row is untouched", async () => {
    const id = await addRowOfA();
    const before = await kitRowsById([id]);

    const reply = await sendJson(`${KIT}/${id}`, { quantity: 0 }, b.jar, "PATCH");

    expect(reply.status).toBe(404);
    expectNoInternals(reply.body);
    expect(await kitRowsById([id])).toEqual(before);
  });

  it("B cannot delete A's row: DELETE gets 404 and the row is still there", async () => {
    const id = await addRowOfA();
    const before = await kitRowsById([id]);

    const reply = await send(`${KIT}/${id}`, { method: "DELETE", jar: b.jar });

    expect(reply.status).toBe(404);
    expectNoInternals(reply.body);
    expect(await kitRowsById([id])).toEqual(before);
    expect(before).toHaveLength(1);
  });

  it("DELETE from a foreign Origin gets 403 and deletes nothing", async () => {
    const id = await addRowOfA();
    const before = await kitRowsById([id]);

    const reply = await send(`${KIT}/${id}`, { method: "DELETE", jar: a.jar, origin: "http://evil.example" });

    expect(reply.status).toBe(403);
    expect(await kitRowsById([id])).toEqual(before);
    expect(before).toHaveLength(1);
  });

  it("A's own PATCH changes the row and keeps A as the owner", async () => {
    const id = await addRowOfA();

    const reply = await sendJson(`${KIT}/${id}`, { quantity: 0 }, a.jar, "PATCH");

    expect(reply.status).toBe(200);
    const [row] = await kitRowsById([id]);
    expect(row.quantity).toBe(0);
    expect(row.owner).toBe(a.email);
  });

  it.each([["userId"], ["user_id"]])(
    "A cannot hand a row over to B through PATCH (%s = B's id): 400, owner unchanged",
    async (key) => {
      const id = await addRowOfA();

      const reply = await sendJson(`${KIT}/${id}`, { quantity: 0, [key]: await userIdOf(b.email) }, a.jar, "PATCH");

      expect(reply.status).toBe(400);
      const [row] = await kitRowsById([id]);
      expect(row.owner).toBe(a.email);
      expect(row.quantity).toBe(1);
    },
  );
});
