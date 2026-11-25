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
    expect(authErrorCode({ code: "same_password" })).toBe("same_password");
    expect(authErrorCode({ code: "weak_password" })).toBe("weak_password");
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

  it("has a Polish message for every code of the password policy", () => {
    // Texts copied by hand from the plan; the numbers 12 and 72 are the rule, not read from the constants.
    expect(authErrorMessage("password_too_short")).toBe(
      "Hasło musi mieć co najmniej 12 znaków. Może to być kilka słów ze spacjami.",
    );
    expect(authErrorMessage("password_too_long")).toBe(
      "Hasło jest za długie (limit 72 bajtów; polskie litery zajmują po 2). Skróć je.",
    );
    expect(authErrorMessage("password_common")).toBe(
      "To hasło jest zbyt popularne albo przypomina Twój adres e-mail. Spróbuj kilku własnych słów, w stylu „zielony rower pod oknem” (ale nie tych samych).",
    );
    expect(authErrorMessage("weak_password")).toBe(
      "Hasło jest za słabe. Użyj co najmniej 12 znaków, najlepiej kilku słów.",
    );
    expect(authErrorMessage("password_mismatch")).toBe("Hasła nie są takie same.");
    expect(authErrorMessage("current_password_invalid")).toBe("Obecne hasło jest nieprawidłowe.");
    expect(authErrorMessage("same_password")).toBe("Nowe hasło musi się różnić od obecnego.");
    expect(authErrorMessage("password_check_failed")).toBe("Nie udało się sprawdzić hasła, zaloguj się ponownie.");
    expect(authErrorMessage("session_expired")).toBe("Sesja wygasła, zaloguj się ponownie.");
  });

  it("keeps the new codes out of the generic message", () => {
    for (const code of [
      "password_too_short",
      "password_too_long",
      "password_common",
      "password_mismatch",
      "current_password_invalid",
      "same_password",
      "password_check_failed",
      "session_expired",
    ]) {
      expect(authErrorMessage(code)).not.toBe(GENERIC);
    }
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
