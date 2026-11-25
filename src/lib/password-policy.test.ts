import { describe, expect, it } from "vitest";
import {
  EXAMPLE_PASSPHRASE,
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  effectivePasswordLength,
  passwordBytes,
  passwordLength,
  passwordLengthProblem,
} from "@/lib/password-policy";

// Numbers come from the rule (NIST SP 800-63B-4, bcrypt's 72 bytes), written by hand, not computed by the code.

describe("the numbers of the rule", () => {
  it("asks for 12 characters and allows 72 bytes", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    expect(MAX_PASSWORD_BYTES).toBe(72);
  });
});

describe("passwordLength", () => {
  it("counts code points, not UTF-16 units", () => {
    expect(passwordLength("")).toBe(0);
    expect(passwordLength("abc")).toBe(3);
    expect(passwordLength("zażółć gęślą")).toBe(12);
    expect(passwordLength("😀")).toBe(1); // two UTF-16 units
    expect(passwordLength("😀".repeat(12))).toBe(12);
  });

  it("counts a space as a character", () => {
    expect(passwordLength("   ")).toBe(3);
  });
});

describe("effectivePasswordLength", () => {
  it("leaves out leading and trailing whitespace, keeps the spaces between words", () => {
    expect(effectivePasswordLength("  kot pije ml  ")).toBe(11);
    expect(effectivePasswordLength("kot pije mleko")).toBe(14);
    expect(effectivePasswordLength("            ")).toBe(0);
  });

  it("counts a decomposed Polish letter as one character, like the composed one", () => {
    expect(effectivePasswordLength("ą")).toBe(1); // a + combining ogonek, NFC gives ą
  });
});

describe("passwordBytes", () => {
  it("counts UTF-8 bytes: a letter with a diacritic takes two, an emoji four", () => {
    expect(passwordBytes("abc")).toBe(3);
    expect(passwordBytes("ą")).toBe(2);
    expect(passwordBytes("ą".repeat(36))).toBe(72);
    expect(passwordBytes("😀")).toBe(4);
  });
});

describe("passwordLengthProblem", () => {
  it("rejects 11 code points and accepts 12", () => {
    expect(passwordLengthProblem("a".repeat(11))).toBe("password_too_short");
    expect(passwordLengthProblem("a".repeat(12))).toBeNull();
  });

  it("counts Polish letters and emoji as one character each at the lower bound", () => {
    expect(passwordLengthProblem("ą".repeat(11))).toBe("password_too_short");
    expect(passwordLengthProblem("ą".repeat(12))).toBeNull();
    expect(passwordLengthProblem("😀".repeat(11))).toBe("password_too_short");
    expect(passwordLengthProblem("😀".repeat(12))).toBeNull();
  });

  it("allows 72 bytes and rejects 73", () => {
    expect(passwordLengthProblem("a".repeat(72))).toBeNull();
    expect(passwordLengthProblem("a".repeat(73))).toBe("password_too_long");
    expect(passwordLengthProblem("ą".repeat(36))).toBeNull(); // 72 bytes
    expect(passwordLengthProblem("ą".repeat(37))).toBe("password_too_long"); // 74 bytes
    expect(passwordLengthProblem("ą".repeat(35) + "a".repeat(2))).toBeNull(); // 72 bytes
    expect(passwordLengthProblem("ą".repeat(35) + "a".repeat(3))).toBe("password_too_long"); // 73 bytes
  });

  it("counts spaces between words but not leading or trailing whitespace", () => {
    expect(passwordLengthProblem("kot pije mleko")).toBeNull();
    expect(passwordLengthProblem("a b c d e f g")).toBeNull(); // 13 characters, 7 letters, spaces inside count
    expect(passwordLengthProblem(" ".repeat(12))).toBe("password_too_short");
    expect(passwordLengthProblem("   abcdefgh  ")).toBe("password_too_short"); // 8 characters once trimmed
    expect(passwordLengthProblem("abcdefghijk ")).toBe("password_too_short"); // 11 letters and a trailing space
    expect(passwordLengthProblem("  abcdefghijkl  ")).toBeNull(); // 12 characters once trimmed
  });

  it("treats the example passphrase as a valid length", () => {
    expect(passwordLengthProblem(EXAMPLE_PASSPHRASE)).toBeNull();
  });
});
