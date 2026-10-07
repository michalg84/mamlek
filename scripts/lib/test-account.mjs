// Throwaway local test account shared by the browser scripts (scripts/perf-search.mjs, scripts/ui-shots.mjs): sign-up
// through the API (without email confirmation: local Supabase only, like scripts/smoke.mjs) and sign-in through the form.

import { URL } from "node:url";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// `prefix` only names the account (`<prefix>-<timestamp>@example.com`). Refuses non-local hosts: the account is created
// with a fixed throwaway password.
export async function signUpTestAccount(baseUrl, prefix) {
  if (!LOCAL_HOSTS.has(new URL(baseUrl).hostname)) {
    throw new Error(`Refusing to create a test account on ${baseUrl}: local hosts only`);
  }
  const email = `${prefix}-${Date.now()}@example.com`;
  const password = "Perf-Test-Passw0rd!";
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    redirect: "manual",
    headers: { Origin: baseUrl, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password }).toString(),
  });
  const location = response.headers.get("location") ?? "";
  if (response.status !== 302 || !location.startsWith("/auth/confirm-email")) {
    throw new Error(`Could not create the test account: sign-up answered ${response.status} ${location}`);
  }
  return { email, password };
}

export async function signIn(page, baseUrl, { email, password }) {
  await page.goto(`${baseUrl}/auth/signin`);
  // The form is a React island; wait for hydration so the typed values are not reset by it.
  await page.waitForSelector("astro-island:has(#email):not([ssr])", { state: "attached" });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  try {
    await page.waitForURL((url) => !url.pathname.startsWith("/auth/"), { timeout: 30_000 });
  } catch {
    throw new Error(`Sign-in failed (still on ${page.url()})`);
  }
}
