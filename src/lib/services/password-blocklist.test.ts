import { describe, expect, it } from "vitest";
import {
  EXAMPLE_PASSPHRASE,
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  passwordBytes,
  passwordLength,
} from "@/lib/password-policy";
import blocklist from "@/lib/services/password-blocklist.json";

// The data guard of the generated list (scripts/build-password-blocklist.mjs): it fails when the file is rebuilt wrongly
// or edited by hand into something the rule cannot use.

describe("password-blocklist.json", () => {
  const { entries } = blocklist;

  it("names its source with a pinned commit and its license", () => {
    expect(blocklist.source).toMatch(
      /^https:\/\/github\.com\/danielmiessler\/SecLists\/blob\/[0-9a-f]{40}\/Passwords\//,
    );
    expect(blocklist.license).toContain("MIT");
  });

  it("has at least 3000 entries (ASVS 6.2.4)", () => {
    expect(entries.length).toBeGreaterThanOrEqual(3000);
  });

  it("holds lower case entries only", () => {
    expect(entries.filter((entry) => entry !== entry.toLowerCase())).toEqual([]);
  });

  it("holds no duplicates", () => {
    expect(new Set(entries).size).toBe(entries.length);
  });

  it("holds only entries the length rule allows", () => {
    const outside = entries.filter(
      (entry) => passwordLength(entry) < MIN_PASSWORD_LENGTH || passwordBytes(entry) > MAX_PASSWORD_BYTES,
    );
    expect(outside).toEqual([]);
  });

  it("starts with the most common entries of the source, as copied by hand", () => {
    expect(entries.slice(0, 3)).toEqual(["123qweasdzxc", "1qaz2wsx3edc", "q1w2e3r4t5y6"]);
    expect(entries).toContain("qwerty123456");
  });

  it("contains the example passphrase of the hint in lower case", () => {
    expect(entries).toContain(EXAMPLE_PASSPHRASE.toLowerCase());
    expect(EXAMPLE_PASSPHRASE).toBe("zielony rower pod oknem");
  });
});
