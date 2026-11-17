import { describe, expect, it } from "vitest";
import { resolveBaseUrl } from "./base-url";

// Regression: Vitest sets BASE_URL to "/" (Vite's base path) in every worker, so a BASE_URL given by the caller never
// reached the tests and the suite always hit port 4321. The caller's choice now travels in API_BASE_URL.
describe("resolveBaseUrl", () => {
  it("uses API_BASE_URL when the caller gives one, even though Vitest overwrote BASE_URL with '/'", () => {
    expect(resolveBaseUrl({ API_BASE_URL: "http://localhost:4332", BASE_URL: "/" })).toBe("http://localhost:4332");
  });

  it("drops a trailing slash", () => {
    expect(resolveBaseUrl({ API_BASE_URL: "http://localhost:4332/" })).toBe("http://localhost:4332");
  });

  it("falls back to an absolute BASE_URL (the variable the other scripts use)", () => {
    expect(resolveBaseUrl({ BASE_URL: "http://localhost:4333" })).toBe("http://localhost:4333");
  });

  it("ignores Vitest's own BASE_URL ('/') and defaults to port 4321", () => {
    expect(resolveBaseUrl({ BASE_URL: "/" })).toBe("http://localhost:4321");
    expect(resolveBaseUrl({})).toBe("http://localhost:4321");
  });

  it("does not take a relative API_BASE_URL as a choice", () => {
    expect(resolveBaseUrl({ API_BASE_URL: "/" })).toBe("http://localhost:4321");
  });
});
