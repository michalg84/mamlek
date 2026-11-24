import { describe, expect, it } from "vitest";
import { passwordProblem } from "@/lib/services/password-check";

// Passwords are copied by hand from the SecLists xato-net list (position 8 is "qwerty123456"), not produced by the code.

const EMAIL = "Jan.Kowalski@example.com";

describe("passwordProblem", () => {
  it("accepts a password that is long enough, not on the list and not the e-mail", () => {
    expect(passwordProblem("kot pije mleko", EMAIL)).toBeNull();
    expect(passwordProblem("zażółć gęślą jaźń", EMAIL)).toBeNull();
  });

  it("rejects a common password, whatever its case", () => {
    expect(passwordProblem("qwerty123456", EMAIL)).toBe("password_common");
    expect(passwordProblem("Qwerty123456", EMAIL)).toBe("password_common");
    expect(passwordProblem("QWERTY123456", EMAIL)).toBe("password_common");
    expect(passwordProblem("123456789012", EMAIL)).toBe("password_common");
  });

  it("rejects the whole e-mail address and the part before the @, whatever its case", () => {
    expect(passwordProblem("jan.kowalski@example.com", EMAIL)).toBe("password_common");
    expect(passwordProblem("JAN.KOWALSKI@EXAMPLE.COM", EMAIL)).toBe("password_common");
    expect(passwordProblem("jan.kowalski", EMAIL)).toBe("password_common"); // 12 characters
    expect(passwordProblem("Jan.Kowalski", "jan.kowalski@example.com")).toBe("password_common");
  });

  it("does not reject a password that only contains the e-mail", () => {
    expect(passwordProblem("jan.kowalski i rower", EMAIL)).toBeNull();
    expect(passwordProblem("example.com jest ok", EMAIL)).toBeNull();
  });

  it("does not treat a part of a short address as a match", () => {
    expect(passwordProblem("kot pije mleko", "kot@example.com")).toBeNull();
  });

  it("checks the length first, also before the e-mail", () => {
    expect(passwordProblem("kot", "kot@example.com")).toBe("password_too_short");
    expect(passwordProblem("qwerty", EMAIL)).toBe("password_too_short");
    expect(passwordProblem("", EMAIL)).toBe("password_too_short");
    expect(passwordProblem("a".repeat(73), EMAIL)).toBe("password_too_long");
    expect(passwordProblem("ą".repeat(37), EMAIL)).toBe("password_too_long");
  });

  it("gives one code when a password is both on the list and the e-mail", () => {
    // "qwerty123456" as the local part of an address is on the list and is the e-mail: one code either way.
    expect(passwordProblem("qwerty123456", "qwerty123456@example.com")).toBe("password_common");
  });

  it("rejects the example passphrase of the hint, because people copy it", () => {
    expect(passwordProblem("zielony rower pod oknem", EMAIL)).toBe("password_common");
  });

  it("rejects the words of the app itself", () => {
    expect(passwordProblem("MamLekMamLek", EMAIL)).toBe("password_common");
    expect(passwordProblem("apteczka1234", EMAIL)).toBe("password_common");
  });
});
