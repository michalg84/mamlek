// The forced and the voluntary password change, as a black box over HTTP on a running app: an account whose password
// breaks the rule is marked at sign-in, kept on /konto/haslo until it changes the password, and the change checks the
// current password and the rule. The rule itself is covered by the unit tests; this proves the gate, the marker and the
// endpoint together. Accounts come from sign-up with a good password; `setWeakPassword` then makes the password the
// kind an old account has. Two accounts per run, and every sign-up, sign-in and re-check of the current password counts
// against the 30 per 5 minutes of the local limit (13 in this file).
import { beforeAll, describe, expect, it } from "vitest";
import { ACCOUNT_PASSWORD, send, setWeakPassword, signUpAndSignIn, type Jar } from "./helpers";

const WEAK = "qwerty123456"; // on the list of common passwords, long enough for Supabase to accept a sign-in
const GOOD = "kot pije mleko";
const FORCED_URL = "/konto/haslo?wymagana=1";

function post(path: string, fields: Record<string, string>, jar: Jar) {
  return send(path, {
    method: "POST",
    body: new URLSearchParams(fields).toString(),
    contentType: "application/x-www-form-urlencoded",
    jar,
  });
}

function signIn(email: string, password: string, jar: Jar) {
  return post("/api/auth/signin", { email, password }, jar);
}

function change(jar: Jar, current: string, password: string, confirm = password) {
  return post("/api/auth/password", { current, password, confirm }, jar);
}

describe("forced password change", () => {
  let email: string;
  const jar: Jar = new Map();
  let firstSignIn: Awaited<ReturnType<typeof signIn>>;

  beforeAll(async () => {
    ({ email } = await signUpAndSignIn("pw-force"));
    await setWeakPassword(email, WEAK);
    firstSignIn = await signIn(email, WEAK, jar);
  });

  it("sends the sign-in of a password on the list to the change screen", () => {
    expect(firstSignIn.status).toBe(302);
    expect(firstSignIn.location).toBe(FORCED_URL);
  });

  it("keeps the marked account out of the pages and the data endpoints", async () => {
    for (const path of ["/szukaj", "/apteczka", "/apteczka/import", "/"]) {
      const page = await send(path, { jar });
      expect(page.status, path).toBe(302);
      expect(page.location, path).toMatch(/^\/(konto\/haslo\?wymagana=1|szukaj)$/);
    }
    const data = await send("/api/kit/check?variantId=1", { jar });
    expect(data.status).toBe(403);
    expect(JSON.parse(data.body)).toEqual({ error: "Password change required" });
    const write = await send("/api/kit", { method: "POST", body: "{}", contentType: "application/json", jar });
    expect(write.status).toBe(403);
  });

  it("shows the change screen in its forced form, with a way out and no navigation", async () => {
    const page = await send("/konto/haslo", { jar });

    expect(page.status).toBe(200);
    expect(page.body).toContain("Ustaw nowe hasło");
    expect(page.body).toContain("Twoje hasło nie spełnia nowych zasad");
    expect(page.body).toContain('action="/api/auth/signout"');
    expect(page.body).not.toContain("Szukaj leku");
  });

  it("refuses a wrong current password, keeps the session and the old password", async () => {
    const reply = await change(jar, "to-nie-jest-haslo", GOOD);

    expect(reply.status).toBe(302);
    expect(reply.location).toBe("/konto/haslo?error=current_password_invalid&wymagana=1");
    const page = await send("/konto/haslo", { jar });
    expect(page.status).toBe(200);
    const again = await signIn(email, WEAK, new Map());
    expect(again.location).toBe(FORCED_URL);
  });

  it("refuses a new password from the list, a short one and a repeat that differs", async () => {
    const common = await change(jar, WEAK, "Qwerty123456");
    expect(common.location).toBe("/konto/haslo?error=password_common&wymagana=1");

    const short = await change(jar, WEAK, "kot pije ml");
    expect(short.location).toBe("/konto/haslo?error=password_too_short&wymagana=1");

    const mismatch = await change(jar, WEAK, GOOD, "kot pije herbatę");
    expect(mismatch.location).toBe("/konto/haslo?error=password_mismatch&wymagana=1");

    const page = await send("/konto/haslo?error=password_common&wymagana=1", { jar });
    expect(page.status).toBe(200);
    expect(page.body).toContain("To hasło jest zbyt popularne");
  });

  it("changes the password, lifts the gate and takes only the new password afterwards", async () => {
    const reply = await change(jar, WEAK, GOOD);

    expect(reply.status).toBe(302);
    expect(reply.location).toBe("/konto/haslo?zmieniono=1");
    const done = await send("/konto/haslo?zmieniono=1", { jar });
    expect(done.status).toBe(200);
    expect(done.body).toContain("Hasło zostało zmienione.");
    expect(done.body).toContain("Szukaj leku");
    expect((await send("/szukaj", { jar })).status).toBe(200);

    const fresh = await signIn(email, GOOD, new Map());
    expect(fresh.location).toBe("/szukaj");
    const old = await signIn(email, WEAK, new Map());
    expect(old.location).toBe("/auth/signin?error=invalid_credentials");
  });
});

describe("password change without the marker", () => {
  it("sends a request without a session to the sign-in page", async () => {
    const reply = await change(new Map(), ACCOUNT_PASSWORD, GOOD);

    expect(reply.status).toBe(302);
    expect(reply.location).toBe("/auth/signin");
  });
});

describe("sign-out of a marked account", () => {
  it("works with the marker set, and the marker survives the next sign-in", async () => {
    const { email } = await signUpAndSignIn("pw-out");
    await setWeakPassword(email, WEAK);
    const jar: Jar = new Map();
    expect((await signIn(email, WEAK, jar)).location).toBe(FORCED_URL);

    const out = await post("/api/auth/signout", {}, jar);

    expect(out.status).toBe(302);
    expect(out.location).toBe("/");
    expect((await send("/szukaj", { jar })).location).toBe("/auth/signin");
    expect((await send("/konto/haslo", { jar })).location).toBe("/auth/signin");
    expect((await signIn(email, WEAK, jar)).location).toBe(FORCED_URL);
  });
});
