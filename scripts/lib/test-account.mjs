// Throwaway local test account shared by the browser scripts (scripts/perf-search.mjs, scripts/ui-shots.mjs): sign-up
// through the API (without email confirmation: local Supabase only, like scripts/smoke.mjs) and sign-in through the form.

// `prefix` only names the account (`<prefix>-<timestamp>@example.com`).
export async function signUpTestAccount(baseUrl, prefix) {
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
