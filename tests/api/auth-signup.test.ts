// The password rule of the sign-up endpoint, as a black box over HTTP on a running app: a refused password gets the
// code of its reason and creates no account, a good one gets in. The rule itself is covered by the unit tests
// (src/lib/services/password-check.test.ts); this proves that the endpoint applies it before it calls Supabase.
// Only the last sign-up reaches Supabase (the refused ones stop in the app), so a run costs one of the 60 sign-ups per
// 5 minutes of the local limit.
import { describe, expect, it } from "vitest";
import { accountCount, send } from "./helpers";

const SIGN_UP = "/api/auth/signup";

function uniqueLocalPart(label: string): string {
  return `api-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function signUp(email: string, password: string) {
  return send(SIGN_UP, {
    method: "POST",
    body: new URLSearchParams({ email, password }).toString(),
    contentType: "application/x-www-form-urlencoded",
  });
}

describe("POST /api/auth/signup password rule", () => {
  it("refuses a password of 11 characters and creates no account", async () => {
    const email = `${uniqueLocalPart("short")}@example.com`;

    const reply = await signUp(email, "kot pije ml"); // 11 characters

    expect(reply.status).toBe(302);
    expect(reply.location).toBe("/auth/signup?error=password_too_short");
    expect(await accountCount(email)).toBe(0);
  });

  it("refuses a common password whatever its case and creates no account", async () => {
    const email = `${uniqueLocalPart("common")}@example.com`;

    const reply = await signUp(email, "QWERTY123456"); // "qwerty123456" is on the list

    expect(reply.status).toBe(302);
    expect(reply.location).toBe("/auth/signup?error=password_common");
    expect(await accountCount(email)).toBe(0);
  });

  it("refuses the part of the address before the @ as the password and creates no account", async () => {
    const local = uniqueLocalPart("same");
    const email = `${local}@example.com`;

    const reply = await signUp(email, local.toUpperCase());

    expect(reply.status).toBe(302);
    expect(reply.location).toBe("/auth/signup?error=password_common");
    expect(await accountCount(email)).toBe(0);
  });

  it("answers a request without a password field with validation_failed, before any account is made", async () => {
    const email = `${uniqueLocalPart("nofield")}@example.com`;

    const reply = await send(SIGN_UP, {
      method: "POST",
      body: new URLSearchParams({ email }).toString(),
      contentType: "application/x-www-form-urlencoded",
    });

    expect(reply.status).toBe(302);
    expect(reply.location).toBe("/auth/signup?error=validation_failed");
    expect(await accountCount(email)).toBe(0);
  });

  it("answers a body that is not a form with validation_failed instead of a 500", async () => {
    const email = `${uniqueLocalPart("json")}@example.com`;

    const reply = await send(SIGN_UP, {
      method: "POST",
      body: JSON.stringify({ email, password: "kot pije mleko" }),
      contentType: "application/json",
    });

    expect(reply.status).toBe(302);
    expect(reply.location).toBe("/auth/signup?error=validation_failed");
    expect(await accountCount(email)).toBe(0);
  });

  it("accepts a passphrase of a few words and creates the account", async () => {
    const email = `${uniqueLocalPart("ok")}@example.com`;

    const reply = await signUp(email, "kot pije mleko");

    expect(reply.status).toBe(302);
    expect(reply.location).toBe("/szukaj");
    expect(await accountCount(email)).toBe(1);
  });
});
