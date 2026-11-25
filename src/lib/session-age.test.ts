import { describe, expect, it } from "vitest";
import {
  SESSION_COOKIE_MAX_AGE,
  SESSION_IDLE_DAYS,
  SESSION_MAX_DAYS,
  authTimeFromClaims,
  decodeTokenClaims,
  sessionCookieMaxAge,
  sessionExpired,
} from "@/lib/session-age";

const DAY = 86400;
const SIGNED_IN = 1_795_530_304;

function token(payload: unknown): string {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  const base64url = btoa(String.fromCharCode(...json))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${base64url}.signature`;
}

describe("session limits", () => {
  it("are 30 days idle and 90 days from sign-in", () => {
    expect(SESSION_IDLE_DAYS).toBe(30);
    expect(SESSION_MAX_DAYS).toBe(90);
    expect(SESSION_COOKIE_MAX_AGE).toBe(30 * DAY);
  });
});

describe("sessionCookieMaxAge", () => {
  it("caps the 400-day default of @supabase/ssr at 30 days", () => {
    expect(sessionCookieMaxAge(400 * DAY)).toBe(30 * DAY);
  });

  it("leaves a shorter lifetime and a deletion alone", () => {
    expect(sessionCookieMaxAge(10 * DAY)).toBe(10 * DAY);
    expect(sessionCookieMaxAge(0)).toBe(0);
    expect(sessionCookieMaxAge(undefined)).toBeUndefined();
  });
});

describe("sessionExpired", () => {
  it("keeps a session one second short of 90 days", () => {
    expect(sessionExpired(SIGNED_IN, SIGNED_IN + 90 * DAY - 1)).toBe(false);
  });

  it("keeps a session of exactly 90 days", () => {
    expect(sessionExpired(SIGNED_IN, SIGNED_IN + 90 * DAY)).toBe(false);
  });

  it("expires a session one second past 90 days", () => {
    expect(sessionExpired(SIGNED_IN, SIGNED_IN + 90 * DAY + 1)).toBe(true);
  });

  it("keeps a fresh session", () => {
    expect(sessionExpired(SIGNED_IN, SIGNED_IN)).toBe(false);
  });

  it("fails closed without a sign-in time", () => {
    expect(sessionExpired(null, SIGNED_IN)).toBe(true);
  });
});

describe("authTimeFromClaims", () => {
  it("reads the timestamp of the AMREntry format", () => {
    expect(authTimeFromClaims({ amr: [{ method: "password", timestamp: SIGNED_IN }] })).toBe(SIGNED_IN);
  });

  it("takes the earliest of several entries, in any order", () => {
    const amr = [
      { method: "totp", timestamp: SIGNED_IN + 500 },
      { method: "password", timestamp: SIGNED_IN },
      { method: "otp", timestamp: SIGNED_IN + 100 },
    ];
    expect(authTimeFromClaims({ amr })).toBe(SIGNED_IN);
  });

  it("gives null for the plain string[] format", () => {
    expect(authTimeFromClaims({ amr: ["password"] })).toBeNull();
  });

  it("gives null without the claim, with no claims, or with an empty list", () => {
    expect(authTimeFromClaims({ sub: "x" })).toBeNull();
    expect(authTimeFromClaims(null)).toBeNull();
    expect(authTimeFromClaims({ amr: [] })).toBeNull();
  });

  it("ignores entries without a numeric timestamp", () => {
    const amr = [
      { method: "password", timestamp: "soon" },
      null,
      { method: "otp" },
      { method: "x", timestamp: SIGNED_IN },
    ];
    expect(authTimeFromClaims({ amr })).toBe(SIGNED_IN);
    expect(authTimeFromClaims({ amr: [{ method: "password", timestamp: "soon" }] })).toBeNull();
  });
});

describe("decodeTokenClaims", () => {
  it("decodes the base64url payload, including non-ASCII text", () => {
    const claims = decodeTokenClaims(
      token({ name: "Zażółć gęślą jaźń", amr: [{ method: "password", timestamp: SIGNED_IN }] }),
    );
    expect(claims?.name).toBe("Zażółć gęślą jaźń");
    expect(authTimeFromClaims(claims)).toBe(SIGNED_IN);
  });

  it("gives null for a missing token, a non-JWT, bad base64 and a non-object payload", () => {
    expect(decodeTokenClaims(undefined)).toBeNull();
    expect(decodeTokenClaims("")).toBeNull();
    expect(decodeTokenClaims("no-dots")).toBeNull();
    expect(decodeTokenClaims("a.!!!.c")).toBeNull();
    expect(decodeTokenClaims(token([1, 2]))).toBeNull();
    expect(decodeTokenClaims(token("text"))).toBeNull();
  });
});
