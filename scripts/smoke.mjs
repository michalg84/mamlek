// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const email = `smoke-${Date.now()}@example.com`;
const password = "Smoke-Test-Passw0rd!";
const jar = new Map();

function cookieHeader(cookies = jar) {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(response, cookies = jar) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
    if (expired) cookies.delete(name.trim());
    else cookies.set(name.trim(), rest.join("="));
  }
}

// `json` sends a JSON body; `jar` picks another cookie jar (another account, or an empty one for anonymous).
async function request(path, { method = "GET", form, json, jar: cookies = jar } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(cookies),
      Origin: BASE_URL,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(json ? { "Content-Type": "application/json" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : json ? JSON.stringify(json) : undefined,
  });
  storeCookies(response, cookies);
  return {
    status: response.status,
    location: response.headers.get("location") ?? "",
    headers: response.headers,
    body: await response.text(),
  };
}

const SEARCH_LIST = "/api/registry/search-list";

function parseVariantCount(body) {
  try {
    const { variants } = JSON.parse(body);
    return Array.isArray(variants) ? variants.length : 0;
  } catch {
    return 0;
  }
}

// Fetches the list, then asks for it again with `v` = its version + `offset` (0 = what the browser does).
// When the first request is not a usable list it is returned as is, so the step fails with that status.
async function requestVersionedSearchList(offset = 0) {
  const first = await request(SEARCH_LIST);
  if (first.status !== 200) {
    return first;
  }
  try {
    return request(`${SEARCH_LIST}?v=${JSON.parse(first.body).version + offset}`);
  } catch {
    return { ...first, status: -1 };
  }
}

const PACKAGES = "/api/registry/packages";
const KIT = "/api/kit";
// Filled by the pack lookup step, used by the later kit steps: the medicine name and its first pack.
const kit = { name: "", packageId: 0 };

function parsePackages(body) {
  try {
    const { packages } = JSON.parse(body);
    return Array.isArray(packages) ? packages : [];
  } catch {
    return [];
  }
}

// Walks the search list for the first variant that has packs and remembers its name and first pack.
// When none has, the last response is returned as is, so the step fails with that status.
async function requestPacksOfFirstVariant() {
  const list = await request(SEARCH_LIST);
  let variants = [];
  try {
    variants = JSON.parse(list.body).variants ?? [];
  } catch {
    // not a usable list: falls through to the failing response below
  }
  let last = { ...list, status: -1 };
  for (const [id, name] of variants.slice(0, 20)) {
    last = await request(`${PACKAGES}?product=${id}`);
    const [first] = parsePackages(last.body);
    if (last.status === 200 && first) {
      kit.name = name;
      kit.packageId = first.packageId;
      return last;
    }
  }
  return last;
}

const steps = [
  ["home renders", () => request("/"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  ["search page redirects anonymous user", () => request("/szukaj"), { status: 302, location: "/auth/signin" }],
  ["search list rejects anonymous user", () => request(SEARCH_LIST), { status: 401 }],
  [
    "signup creates account",
    () => request("/api/auth/signup", { method: "POST", form: { email, password } }),
    { status: 302, location: "/auth/confirm-email" },
  ],
  [
    "signin rejects wrong password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password: "wrong" } }),
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "signin accepts correct password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/" },
  ],
  ["dashboard renders for signed-in user", () => request("/dashboard"), { status: 200 }],
  ["search page renders for signed-in user", () => request("/szukaj"), { status: 200 }],
  [
    "search list returns variants for signed-in user",
    () => request(SEARCH_LIST),
    { status: 200, check: (actual) => parseVariantCount(actual.body) > 0 },
  ],
  ["search list rejects invalid version", () => request(`${SEARCH_LIST}?v=abc`), { status: 400 }],
  [
    "search list is immutable for its own version",
    () => requestVersionedSearchList(),
    { status: 200, check: (actual) => /^private,.*\bimmutable\b/.test(actual.headers.get("cache-control") ?? "") },
  ],
  [
    "search list is not immutable for another version",
    () => requestVersionedSearchList(1),
    {
      status: 200,
      check: (actual) => {
        const cacheControl = actual.headers.get("cache-control") ?? "";
        return /^private,.*\bno-cache\b/.test(cacheControl) && !/immutable/.test(cacheControl);
      },
    },
  ],
  [
    "kit page redirects anonymous user",
    () => request("/apteczka", { jar: new Map() }),
    { status: 302, location: "/auth/signin" },
  ],
  [
    "kit add rejects anonymous user",
    () => request(KIT, { method: "POST", json: { packageId: 1 }, jar: new Map() }),
    { status: 401 },
  ],
  ["packs lookup rejects invalid product", () => request(`${PACKAGES}?product=abc`), { status: 400 }],
  [
    "packs lookup returns packs for a variant",
    () => requestPacksOfFirstVariant(),
    { status: 200, check: (actual) => parsePackages(actual.body).length > 0 },
  ],
  [
    "kit add stores a pack without quantity and expiry",
    () => request(KIT, { method: "POST", json: { packageId: kit.packageId } }),
    { status: 201, check: (actual) => Number.isInteger(JSON.parse(actual.body).id) },
  ],
  [
    "kit add rejects negative quantity",
    () => request(KIT, { method: "POST", json: { packageId: kit.packageId, quantity: -1 } }),
    { status: 400 },
  ],
  [
    "kit add rejects unknown package",
    () => request(KIT, { method: "POST", json: { packageId: 999999999999 } }),
    { status: 400 },
  ],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
];

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined || actual.location.startsWith(expected.location)) &&
    (expected.check === undefined || expected.check(actual));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${expected.location ?? ""}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
