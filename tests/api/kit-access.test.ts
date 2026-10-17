// Who can reach the kit through the app's own routes, as a black box over HTTP on a running app. The expectations come
// from the risk (test plan #4): a call without a session gets nothing and is refused before its content is looked at,
// the owner of a row is the session and never the request, and one account never sees another account's kit.
import { beforeAll, describe, expect, it } from "vitest";
import {
  escapeHtml,
  expectNoInternals,
  kitRowCount,
  loadBoundaryData,
  send,
  sendJson,
  signUpAndSignIn,
  userIdOf,
  type BoundaryData,
  type Jar,
} from "./helpers";

const KIT = "/api/kit";
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

  it("another account opening /apteczka?dodano=<id of A's row> sees neither the confirmation nor A's medicine", async () => {
    // A third account with an empty kit, so that its own page cannot contain the medicine for another reason.
    const c = await signUpAndSignIn("viewer");
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
