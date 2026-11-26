// The reset of a forgotten password, as a black box over HTTP on a running app and the local Supabase: the request for
// a link tells nothing about the account, the link from the mail (read from Mailpit) is used up only when the password
// can be set, the recovery session opens nothing but the reset, and the new password signs the user in and ends the
// other sessions. The two decisions of the app are covered by the unit tests (src/lib/password-reset.test.ts). Two
// accounts per run: 8 sign-ups and sign-ins of the 60 per 5 minutes of the local limit, at most 4 reset mails and
// 2 notifications of the 100 e-mails per hour.
import { setTimeout as delay } from "node:timers/promises";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ACCOUNT_PASSWORD,
  BASE_URL,
  mailsTo,
  resetLinkPath,
  send,
  setWeakPassword,
  signUpAndSignIn,
  waitForMail,
  type Jar,
  type Reply,
} from "./helpers";

const WEAK = "qwerty123456"; // on the list of common passwords, long enough for Supabase to accept a sign-in
const GOOD = "kot pije mleko";
const SENT_URL = "/auth/forgot-password?wyslano=1";
const EXPIRED_URL = "/auth/reset-password?error=otp_expired";
const FORCED_URL = "/konto/haslo?wymagana=1";
const RESET_SUBJECT = "Ustaw nowe hasło w MamLek";
const CHANGED_SUBJECT = "Twoje hasło w MamLek zostało zmienione";
const RECOVERY_COOKIE = /^mamlek-recovery(\.\d+)?$/;
const SESSION_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

function post(path: string, fields: Record<string, string>, jar?: Jar, origin?: string) {
  return send(path, {
    method: "POST",
    body: new URLSearchParams(fields).toString(),
    contentType: "application/x-www-form-urlencoded",
    jar,
    origin,
  });
}

function signIn(email: string, password: string, jar?: Jar) {
  return post("/api/auth/signin", { email, password }, jar);
}

function forgot(email: string, jar?: Jar) {
  return post("/api/auth/forgot-password", { email }, jar);
}

/** The form of the reset page; without `token` it is the retry that relies on the recovery cookie. */
function reset(jar: Jar, password: string, { token, confirm = password }: { token?: string; confirm?: string } = {}) {
  const fields: Record<string, string> = { password, confirm };
  if (token !== undefined) {
    fields.token_hash = token;
  }
  return post("/api/auth/reset-password", fields, jar);
}

/** Asks for a link and returns the token of the mail that this very request sent (an older link stops working). */
async function requestToken(email: string, jar?: Jar): Promise<string> {
  await delay(1100); // `max_frequency` (supabase/config.toml): one mail per account per second
  const seen = await mailsTo(email);
  expect((await forgot(email, jar)).location).toBe(SENT_URL);
  const mail = await waitForMail(email, RESET_SUBJECT, seen);
  const token = new URL(await resetLinkPath(mail), BASE_URL).searchParams.get("token_hash");
  if (!token) {
    throw new Error("The password reset link has no token_hash");
  }
  return token;
}

/** The `Set-Cookie` headers of a reply for the cookies whose name matches, attributes in lower case. */
function setCookies(reply: Reply, name: RegExp) {
  return reply.setCookies
    .map((raw) => {
      const [pair, ...attributes] = raw.split(";");
      return { name: pair.split("=")[0].trim(), attributes: attributes.map((part) => part.trim().toLowerCase()) };
    })
    .filter((cookie) => name.test(cookie.name));
}

function maxAge(cookie: { attributes: string[] }): number {
  return Number(cookie.attributes.find((part) => part.startsWith("max-age="))?.slice("max-age=".length));
}

describe("password reset", () => {
  let email: string;
  /** A session opened before the reset, as on another device. */
  let other: Jar;
  /** The browser that opens the link: signed out at the start. */
  const browser: Jar = new Map();
  let token: string;

  beforeAll(async () => {
    ({ email, jar: other } = await signUpAndSignIn("reset"));
  });

  it("answers the same for an address with and without an account, and sets no cookie", async () => {
    const nobody = `api-reset-nobody-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

    const first = await forgot(email);
    // Right after the first one, so Supabase refuses to send another mail: the answer must not tell.
    const again = await forgot(email);
    const unknown = await forgot(nobody);

    for (const reply of [first, again, unknown]) {
      expect(reply.status).toBe(302);
      expect(reply.location).toBe(SENT_URL);
      expect(reply.setCookies).toEqual([]);
    }
    await waitForMail(email, RESET_SUBJECT);
    expect(await mailsTo(nobody)).toEqual([]);
  });

  it("keeps the link in the URL and unused after a mismatched, short or common password", async () => {
    token = await requestToken(email);
    const back = (error: string) => `/auth/reset-password?error=${error}&token_hash=${token}`;

    const mismatch = await reset(browser, GOOD, { token, confirm: "kot pije herbatę" });
    const short = await reset(browser, "kot pije ml", { token });
    const common = await reset(browser, WEAK, { token });

    expect(mismatch.location).toBe(back("password_mismatch"));
    expect(short.location).toBe(back("password_too_short"));
    expect(common.location).toBe(back("password_common"));
    expect(browser.size).toBe(0);
  });

  it("uses the link up when only the e-mail comparison fails, and keeps the state in a short-lived cookie", async () => {
    // Only the account behind the link tells that the password is its address, so the link has to be verified first.
    const reply = await reset(browser, email, { token });

    expect(reply.status).toBe(302);
    expect(reply.location).toBe("/auth/reset-password?error=password_common");
    const recovery = setCookies(reply, RECOVERY_COOKIE);
    expect(recovery.length).toBeGreaterThan(0);
    for (const cookie of recovery) {
      expect(cookie.attributes, cookie.name).toEqual(expect.arrayContaining(["httponly", "path=/", "samesite=lax"]));
      expect(maxAge(cookie), cookie.name).toBeGreaterThan(0);
      expect(maxAge(cookie), cookie.name).toBeLessThanOrEqual(900);
    }
    expect([...browser.keys()].filter((name) => !RECOVERY_COOKIE.test(name))).toEqual([]);
  });

  it("does not open the app with the recovery cookie alone", async () => {
    const page = await send("/szukaj", { jar: new Map(browser) });

    expect(page.status).toBe(302);
    expect(page.location).toBe("/auth/signin");
  });

  it("refuses a used link, even next to a valid recovery cookie, and a request with neither", async () => {
    const used = await reset(new Map(), GOOD, { token });
    // The token alone counts when it is there: the cookie must not stand in for it.
    const usedWithCookie = await reset(new Map(browser), GOOD, { token });
    const neither = await reset(new Map(), GOOD);

    expect(used.location).toBe(EXPIRED_URL);
    expect(usedWithCookie.location).toBe(EXPIRED_URL);
    expect(neither.location).toBe(EXPIRED_URL);
  });

  it("sets the password from the recovery cookie, signs the user in and drops that cookie", async () => {
    expect((await send("/szukaj", { jar: other })).status).toBe(200);
    const held = [...browser.keys()].filter((name) => RECOVERY_COOKIE.test(name));
    expect(held.length).toBeGreaterThan(0);

    const reply = await reset(browser, GOOD);

    expect(reply.status).toBe(302);
    expect(reply.location).toBe("/szukaj");
    const recovery = setCookies(reply, RECOVERY_COOKIE);
    expect(recovery.map((cookie) => cookie.name)).toEqual(expect.arrayContaining(held));
    for (const cookie of recovery) {
      expect(maxAge(cookie), cookie.name).toBe(0);
    }
    expect(setCookies(reply, SESSION_COOKIE).some((cookie) => maxAge(cookie) > 0)).toBe(true);
    expect([...browser.keys()].filter((name) => RECOVERY_COOKIE.test(name))).toEqual([]);
    expect((await send("/szukaj", { jar: browser })).status).toBe(200);
  });

  it("ends the session opened before the reset", async () => {
    const page = await send("/szukaj", { jar: other });

    expect(page.status).toBe(302);
    expect(page.location).toBe("/auth/signin");
  });

  it("takes only the new password afterwards", async () => {
    expect((await signIn(email, ACCOUNT_PASSWORD)).location).toBe("/auth/signin?error=invalid_credentials");
    expect((await signIn(email, GOOD)).location).toBe("/szukaj");
  });

  it("notifies the account by mail that the password has changed", async () => {
    await expect(waitForMail(email, CHANGED_SUBJECT)).resolves.toMatchObject({ subject: CHANGED_SUBJECT });
  });

  it("refuses both endpoints to a page of another origin", async () => {
    for (const path of ["/api/auth/forgot-password", "/api/auth/reset-password"]) {
      const reply = await post(path, { email, password: GOOD, confirm: GOOD }, undefined, "https://evil.example");
      expect(reply.status, path).toBe(403);
    }
  });
});

describe("password reset of an account with a forced password change", () => {
  it("is open to the marked session, and removes the marker", async () => {
    const { email } = await signUpAndSignIn("reset-force");
    await setWeakPassword(email, WEAK);
    const jar: Jar = new Map();
    expect((await signIn(email, WEAK, jar)).location).toBe(FORCED_URL);
    expect((await send("/szukaj", { jar })).location).toBe(FORCED_URL);

    // Both endpoints answer the marked session itself, which the middleware keeps away from the rest of the API.
    const token = await requestToken(email, jar);
    const reply = await reset(jar, GOOD, { token });

    expect(reply.status).toBe(302);
    expect(reply.location).toBe("/szukaj");
    expect((await send("/szukaj", { jar })).status).toBe(200);
    expect((await signIn(email, GOOD)).location).toBe("/szukaj");
  });
});
