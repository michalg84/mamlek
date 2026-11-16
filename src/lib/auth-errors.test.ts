import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { authErrorCode, authErrorMessage, sessionCheckFailure } from "@/lib/auth-errors";

const GENERIC = "Coś poszło nie tak. Spróbuj ponownie za chwilę.";

describe("authErrorCode", () => {
  it("keeps a known Supabase code", () => {
    expect(authErrorCode(new AuthApiError("Invalid login credentials", 400, "invalid_credentials"))).toBe(
      "invalid_credentials",
    );
    expect(authErrorCode({ code: "user_already_exists" })).toBe("user_already_exists");
  });

  it("turns an unknown code, a missing code and no error into unknown", () => {
    expect(authErrorCode({ code: "saml_idp_not_found" })).toBe("unknown");
    expect(authErrorCode(new AuthRetryableFetchError("fetch failed", 0))).toBe("unknown");
    expect(authErrorCode({})).toBe("unknown");
    expect(authErrorCode(null)).toBe("unknown");
  });

  it("never passes a property name of a plain object as a code", () => {
    expect(authErrorCode({ code: "toString" })).toBe("unknown");
    expect(authErrorCode({ code: "__proto__" })).toBe("unknown");
  });
});

describe("authErrorMessage", () => {
  it("shows nothing without an error parameter", () => {
    expect(authErrorMessage(null)).toBeNull();
  });

  it("shows the Polish message of a known code", () => {
    expect(authErrorMessage("invalid_credentials")).toBe("Nieprawidłowy e-mail lub hasło.");
    expect(authErrorMessage("session_check_failed")).toBe(
      "Nie udało się sprawdzić sesji — serwis jest chwilowo niedostępny. Zaloguj się ponownie za chwilę.",
    );
    expect(authErrorMessage("user_already_exists")).toBe(authErrorMessage("email_exists"));
  });

  it("shows the generic message instead of any other text, including hand-written text", () => {
    expect(authErrorMessage("unknown")).toBe(GENERIC);
    expect(authErrorMessage("Twoje konto zostało zablokowane, zadzwoń pod 123")).toBe(GENERIC);
    expect(authErrorMessage("<script>alert(1)</script>")).toBe(GENERIC);
    expect(authErrorMessage("")).toBe(GENERIC);
    expect(authErrorMessage("constructor")).toBe(GENERIC);
  });
});

describe("sessionCheckFailure", () => {
  it("treats no error and a missing session as an anonymous request", () => {
    expect(sessionCheckFailure(null)).toBe("none");
    expect(sessionCheckFailure(new AuthSessionMissingError())).toBe("none");
  });

  it("treats a network failure or a server error as an outage", () => {
    expect(sessionCheckFailure(new AuthRetryableFetchError("fetch failed", 0))).toBe("outage");
    expect(sessionCheckFailure(new AuthRetryableFetchError("Bad Gateway", 502))).toBe("outage");
    expect(sessionCheckFailure(new AuthApiError("Internal error", 500, "unexpected_failure"))).toBe("outage");
    expect(sessionCheckFailure(new Error("no status"))).toBe("outage");
  });

  it("treats a session the server refused as rejected, not an outage", () => {
    expect(sessionCheckFailure(new AuthApiError("Session not found", 403, "session_not_found"))).toBe("rejected");
    expect(sessionCheckFailure(new AuthApiError("invalid JWT", 401, "bad_jwt"))).toBe("rejected");
  });
});
