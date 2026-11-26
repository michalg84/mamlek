import { describe, expect, it } from "vitest";
import { forgotPasswordErrorCode, resetPageState, type RecoveryRead } from "@/lib/password-reset";

describe("forgotPasswordErrorCode", () => {
  it("stays neutral when Supabase accepted the request", () => {
    expect(forgotPasswordErrorCode(null)).toBeNull();
  });

  it("reports an auth server that cannot be reached", () => {
    expect(forgotPasswordErrorCode({ status: 0 })).toBe("unknown");
    expect(forgotPasswordErrorCode({})).toBe("unknown");
  });

  it("reports the request limit, which does not depend on the account", () => {
    expect(forgotPasswordErrorCode({ status: 429, code: "over_request_rate_limit" })).toBe("over_request_rate_limit");
  });

  it.each([
    ["the e-mail limit", { status: 429, code: "over_email_send_rate_limit" }],
    ["a 429 without a code", { status: 429 }],
    ["a failed send", { status: 500, code: "unexpected_failure" }],
    ["an unavailable server", { status: 503 }],
    ["a gateway timeout", { status: 504 }],
    ["a refused request", { status: 400, code: "validation_failed" }],
    ["an unknown address", { status: 404, code: "user_not_found" }],
  ])("stays neutral on %s", (_label, error) => {
    expect(forgotPasswordErrorCode(error)).toBeNull();
  });
});

describe("resetPageState", () => {
  const user: RecoveryRead = { kind: "user", email: "ala@example.com" };
  const none: RecoveryRead = { kind: "none" };
  const outage: RecoveryRead = { kind: "outage" };

  it.each([
    ["a valid recovery cookie", null, user],
    ["a token", "abc", none],
    ["a token and a valid recovery cookie", "abc", user],
    ["an outage", null, outage],
  ])("calls a refused link invalid next to %s", (_label, tokenHash, session) => {
    expect(resetPageState({ error: "otp_expired", tokenHash, session })).toEqual({ kind: "invalid_link" });
  });

  it.each([
    ["no session", none],
    ["a valid recovery cookie", user],
    ["an outage", outage],
  ])("shows the form with the token next to %s", (_label, session) => {
    expect(resetPageState({ error: null, tokenHash: "abc", session })).toEqual({
      kind: "token_form",
      tokenHash: "abc",
    });
  });

  it("keeps the form with the token after another error", () => {
    expect(resetPageState({ error: "password_mismatch", tokenHash: "abc", session: none })).toEqual({
      kind: "token_form",
      tokenHash: "abc",
    });
  });

  it("shows the form for the account of the recovery cookie when there is no token", () => {
    const expected = { kind: "session_form", email: "ala@example.com" };

    expect(resetPageState({ error: null, tokenHash: null, session: user })).toEqual(expected);
    expect(resetPageState({ error: "password_common", tokenHash: null, session: user })).toEqual(expected);
  });

  it("treats an empty token as no token", () => {
    expect(resetPageState({ error: null, tokenHash: "", session: user })).toEqual({
      kind: "session_form",
      email: "ala@example.com",
    });
    expect(resetPageState({ error: null, tokenHash: "", session: none })).toEqual({ kind: "invalid_link" });
  });

  it("says unavailable, not expired, when the session cannot be read", () => {
    expect(resetPageState({ error: null, tokenHash: null, session: outage })).toEqual({ kind: "unavailable" });
    expect(resetPageState({ error: "unknown", tokenHash: null, session: outage })).toEqual({ kind: "unavailable" });
  });

  it("calls the link invalid without a token and a session", () => {
    expect(resetPageState({ error: null, tokenHash: null, session: none })).toEqual({ kind: "invalid_link" });
  });
});
