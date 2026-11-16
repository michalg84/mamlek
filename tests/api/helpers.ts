// Helpers of the API tests: a session over cookies (its own copy of scripts/smoke.mjs, which stays dependency-free),
// raw HTTP requests, boundary data picked from the local registry, and the checks every rejected request goes through.
import { connectLocal, LOCAL_HOSTS } from "../db/medicine-check-fixtures";

// Vitest itself sets BASE_URL to "/" (Vite's base path), so only an absolute URL counts as the caller's choice.
const fromEnv = process.env.BASE_URL;
export const BASE_URL = fromEnv?.startsWith("http") ? fromEnv.replace(/\/$/, "") : "http://localhost:4321";

// Local servers only: the suite signs up accounts and writes kit rows, and checks them in the local database.
if (!LOCAL_HOSTS.has(new URL(BASE_URL).hostname)) {
  throw new Error(`BASE_URL must point to a local server (got ${BASE_URL})`);
}

export type Jar = Map<string, string>;

function cookieHeader(jar: Jar): string {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function storeCookies(response: Response, jar: Jar): void {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    if (attrs.some((attr) => /max-age=0/i.test(attr.trim()))) {
      jar.delete(name.trim());
    } else {
      jar.set(name.trim(), rest.join("="));
    }
  }
}

export interface SendOptions {
  method?: string;
  /** Raw body, so that broken JSON can be sent. */
  body?: string;
  /** Sent as is; leave undefined to send no Content-Type header at all. */
  contentType?: string;
  /** The session; an empty jar (the default) is an anonymous caller. */
  jar?: Jar;
  /** The `Origin` header; the app's own (BASE_URL) by default, so only a test of a foreign page sets another. */
  origin?: string;
}

export interface Reply {
  status: number;
  location: string;
  body: string;
}

export async function send(path: string, options: SendOptions = {}): Promise<Reply> {
  const jar = options.jar ?? new Map<string, string>();
  const headers: Record<string, string> = { Cookie: cookieHeader(jar), Origin: options.origin ?? BASE_URL };
  if (options.contentType !== undefined) {
    headers["Content-Type"] = options.contentType;
  }
  const response = await fetch(BASE_URL + path, {
    method: options.method ?? "GET",
    redirect: "manual",
    headers,
    // A string body would get a text/plain Content-Type from fetch; bytes get none.
    body: options.body === undefined ? undefined : new TextEncoder().encode(options.body),
  });
  storeCookies(response, jar);
  return { status: response.status, location: response.headers.get("location") ?? "", body: await response.text() };
}

/** `POST` (or another `method`) with a JSON body (an object is stringified, a string is sent as is). */
export function sendJson(path: string, body: unknown, jar?: Jar, method = "POST"): Promise<Reply> {
  return send(path, {
    method,
    body: typeof body === "string" ? body : JSON.stringify(body),
    contentType: "application/json",
    jar,
  });
}

const PASSWORD = "Api-Test-Passw0rd!";

/** Creates an account and signs it in; the error says so when the local sign-up rate limit refused it. */
export async function signUpAndSignIn(label: string): Promise<{ email: string; jar: Jar }> {
  const email = `api-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const jar: Jar = new Map();
  const form = (path: string) =>
    send(path, {
      method: "POST",
      body: new URLSearchParams({ email, password: PASSWORD }).toString(),
      contentType: "application/x-www-form-urlencoded",
      jar,
    });
  const limit =
    "the limit of 30 sign-ups and sign-ins per 5 minutes (supabase/config.toml; wait a few minutes or restart Supabase)";
  // With e-mail confirmation on, sign-up still succeeds and only sign-in is refused ("Email not confirmed").
  const confirmation = "e-mail confirmation being on (enable_confirmations in supabase/config.toml)";
  const signUp = await form("/api/auth/signup");
  if (signUp.status !== 302 || signUp.location !== "/auth/confirm-email") {
    throw new Error(
      `Sign-up of ${email} failed (status ${signUp.status}, location "${signUp.location}"). ` +
        `Locally the cause is usually ${limit}.`,
    );
  }
  const signIn = await form("/api/auth/signin");
  if (signIn.status !== 302 || signIn.location !== "/szukaj") {
    throw new Error(
      `Sign-in of ${email} failed (status ${signIn.status}, location "${signIn.location}"). ` +
        `Locally the cause is usually ${confirmation} or ${limit}.`,
    );
  }
  // A local server can still use a cloud Supabase; then every row count below would read the wrong database.
  const [account] = await query<{ n: number }>("select count(*)::int as n from auth.users where email = $1", [email]);
  if (account.n !== 1) {
    throw new Error(`${email} is not in the local auth.users: the server at ${BASE_URL} does not use DATABASE_URL`);
  }
  return { email, jar };
}

// --- Local database reads ----------------------------------------------------------------------------------------

async function query<T extends object>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = await connectLocal();
  try {
    return (await client.query<T>(sql, params)).rows;
  } finally {
    await client.end();
  }
}

async function one<T extends object>(what: string, sql: string): Promise<T> {
  const rows = await query<T>(sql);
  if (rows.length === 0) {
    throw new Error(`The local registry has no ${what}: import the fixtures (see AGENTS.md, registry:import)`);
  }
  return rows[0];
}

// Active = the pack and its product are not withdrawn. A pack "with a size" has exactly one `units` entry whose count
// is a positive integer (the rule of POST /api/kit: the quantity may not exceed it).
const SIZE_SHAPE = `jsonb_array_length(pk.units) = 1 and btrim(coalesce(pk.units->0->>'count', '')) ~ '^[0-9]+$'`;
// Certainly without a size for the app whatever the whitespace (its trim also strips tabs and NBSP, btrim does not):
// not exactly one entry, or a count with no digit at all.
const UNSIZED_SHAPE = `(jsonb_array_length(pk.units) <> 1 or coalesce(pk.units->0->>'count', '') !~ '[0-9]')`;

/** SQL for the numeric size of pack `alias` (null when it has none); the CASE keeps the cast away from non-digits. */
function sizeOf(alias: string): string {
  return `(case when ${SIZE_SHAPE.replaceAll("pk.", `${alias}.`)} then btrim(${alias}.units->0->>'count')::numeric end)`;
}

/** The numeric size of pack `alias` lies in lo..hi. */
function sizeIn(alias: string, lo: number, hi: number): string {
  return `${sizeOf(alias)} between ${lo} and ${hi}`;
}

export interface BoundaryData {
  /** An active pack with a size of at least 3 (the PATCH tests store a quantity of 3), its size and its product. */
  sized: { packageId: number; size: number; productId: number; productName: string };
  /** An active pack of an active product without a size. */
  unsized: { packageId: number };
  /** A withdrawn pack of an active product. */
  withdrawnPackage: { packageId: number };
  /** A pack of a withdrawn product. */
  withdrawnProductPackage: { packageId: number };
  /**
   * Two active packs of one active product (so of one variant) with different numeric sizes, `small.size` below
   * `large.size`, both within 1..99999.
   */
  siblings: {
    productId: number;
    small: { packageId: number; size: number };
    large: { packageId: number; size: number };
  };
  /** An active pack with a size of an active product of another variant than `siblings`. */
  otherVariant: { packageId: number };
  /** A withdrawn pack (the pack or its product withdrawn) of another variant than `siblings`. */
  otherVariantWithdrawn: { packageId: number };
  /** A withdrawn pack of an active product in the variant of `siblings` (a pack change may move an item onto it). */
  siblingWithdrawn: { packageId: number };
  /** Two packs of one withdrawn product (so of one variant), `from` with the lower id. */
  withdrawnProductPair: { from: { packageId: number }; to: { packageId: number } };
  /** A withdrawn pack with a numeric size of an active product, and its size. */
  withdrawnSized: { packageId: number; size: number };
}

export async function loadBoundaryData(): Promise<BoundaryData> {
  const sized = await one<{ package_id: number; size: number; product_id: number; name: string }>(
    "active pack with a numeric size",
    `select pk.id::float8 as package_id, btrim(pk.units->0->>'count')::int as size, p.id::float8 as product_id, p.name
       from registry_packages pk join registry_products p on p.id = pk.product_id
      where pk.removed_at is null and p.removed_at is null and ${SIZE_SHAPE}
        and btrim(pk.units->0->>'count')::numeric between 3 and 99999
      order by pk.id limit 1`,
  );
  const unsized = await one<{ package_id: number }>(
    "active pack without a numeric size",
    `select pk.id::float8 as package_id
       from registry_packages pk join registry_products p on p.id = pk.product_id
      where pk.removed_at is null and p.removed_at is null and ${UNSIZED_SHAPE}
      order by pk.id limit 1`,
  );
  const withdrawnPackage = await one<{ package_id: number }>(
    "withdrawn pack of an active product",
    `select pk.id::float8 as package_id
       from registry_packages pk join registry_products p on p.id = pk.product_id
      where pk.removed_at is not null and p.removed_at is null order by pk.id limit 1`,
  );
  const withdrawnProductPackage = await one<{ package_id: number }>(
    "pack of a withdrawn product",
    `select pk.id::float8 as package_id
       from registry_packages pk join registry_products p on p.id = pk.product_id
      where p.removed_at is not null order by pk.id limit 1`,
  );
  // The pair comes from one product: its packs are in the variant of the product, which is what a pack change needs.
  const siblings = await one<{
    small_id: number;
    small_size: number;
    large_id: number;
    large_size: number;
    product_id: number;
  }>(
    "product with two active packs of different numeric sizes",
    `select a.id::float8 as small_id, btrim(a.units->0->>'count')::int as small_size,
            b.id::float8 as large_id, btrim(b.units->0->>'count')::int as large_size, a.product_id::float8 as product_id
       from registry_packages a
       join registry_products p on p.id = a.product_id
       join registry_packages b on b.product_id = a.product_id and b.id <> a.id
      where a.removed_at is null and b.removed_at is null and p.removed_at is null
        and ${sizeIn("a", 1, 99998)} and ${sizeIn("b", 2, 99999)}
        and ${sizeOf("a")} < ${sizeOf("b")}
      order by a.id, b.id limit 1`,
  );
  const otherVariants = await query<{ package_id: number }>(
    `select pk.id::float8 as package_id
       from registry_packages pk
       join registry_products p on p.id = pk.product_id
       join registry_products base on base.id = $1
      where pk.removed_at is null and p.removed_at is null and ${SIZE_SHAPE}
        and not (lower(p.name) = lower(base.name)
             and lower(coalesce(p.strength, '')) = lower(coalesce(base.strength, ''))
             and lower(coalesce(p.pharmaceutical_form, '')) = lower(coalesce(base.pharmaceutical_form, '')))
      order by pk.id limit 1`,
    [siblings.product_id],
  );
  if (otherVariants.length === 0) {
    throw new Error("The local registry has no active pack of another variant: import the fixtures");
  }
  // Same variant-key rule as registry_variant_packages (lower name, strength, pharmaceutical form).
  const sameVariantAsSiblings = `lower(p.name) = lower(base.name)
             and lower(coalesce(p.strength, '')) = lower(coalesce(base.strength, ''))
             and lower(coalesce(p.pharmaceutical_form, '')) = lower(coalesce(base.pharmaceutical_form, ''))`;
  const otherVariantsWithdrawn = await query<{ package_id: number }>(
    `select pk.id::float8 as package_id
       from registry_packages pk
       join registry_products p on p.id = pk.product_id
       join registry_products base on base.id = $1
      where (pk.removed_at is not null or p.removed_at is not null) and not (${sameVariantAsSiblings})
      order by pk.id limit 1`,
    [siblings.product_id],
  );
  if (otherVariantsWithdrawn.length === 0) {
    throw new Error("The local registry has no withdrawn pack of another variant: import the fixtures");
  }
  const siblingsWithdrawn = await query<{ package_id: number }>(
    `select pk.id::float8 as package_id
       from registry_packages pk
       join registry_products p on p.id = pk.product_id
       join registry_products base on base.id = $1
      where pk.removed_at is not null and p.removed_at is null and ${sameVariantAsSiblings}
      order by pk.id limit 1`,
    [siblings.product_id],
  );
  if (siblingsWithdrawn.length === 0) {
    throw new Error(
      "The local registry has no withdrawn pack in the variant of the sibling packs: import the fixtures",
    );
  }
  const withdrawnProductPair = await one<{ from_id: number; to_id: number }>(
    "withdrawn product with two packs",
    `select a.id::float8 as from_id, b.id::float8 as to_id
       from registry_packages a
       join registry_products p on p.id = a.product_id
       join registry_packages b on b.product_id = a.product_id and b.id > a.id
      where p.removed_at is not null
      order by a.id, b.id limit 1`,
  );
  const withdrawnSized = await one<{ package_id: number; size: number }>(
    "withdrawn pack with a numeric size of an active product",
    `select pk.id::float8 as package_id, btrim(pk.units->0->>'count')::int as size
       from registry_packages pk join registry_products p on p.id = pk.product_id
      where pk.removed_at is not null and p.removed_at is null and ${sizeIn("pk", 1, 99999)}
      order by pk.id limit 1`,
  );
  return {
    siblings: {
      productId: siblings.product_id,
      small: { packageId: siblings.small_id, size: siblings.small_size },
      large: { packageId: siblings.large_id, size: siblings.large_size },
    },
    otherVariant: { packageId: otherVariants[0].package_id },
    otherVariantWithdrawn: { packageId: otherVariantsWithdrawn[0].package_id },
    siblingWithdrawn: { packageId: siblingsWithdrawn[0].package_id },
    withdrawnProductPair: {
      from: { packageId: withdrawnProductPair.from_id },
      to: { packageId: withdrawnProductPair.to_id },
    },
    withdrawnSized: { packageId: withdrawnSized.package_id, size: withdrawnSized.size },
    sized: { packageId: sized.package_id, size: sized.size, productId: sized.product_id, productName: sized.name },
    unsized: { packageId: unsized.package_id },
    withdrawnPackage: { packageId: withdrawnPackage.package_id },
    withdrawnProductPackage: { packageId: withdrawnProductPackage.package_id },
  };
}

/** Number of kit rows of the account with this e-mail. */
export async function kitRowCount(email: string): Promise<number> {
  const [row] = await query<{ n: number }>(
    "select count(*)::int as n from kit_items k join auth.users u on u.id = k.user_id where u.email = $1",
    [email],
  );
  return row.n;
}

export interface KitRow {
  id: number;
  owner: string;
  packageId: number;
  quantity: number | null;
  /** YYYY-MM-DD, as the database stores it. */
  expiresOn: string | null;
  expiryPrecision: "month" | "day" | null;
}

/** The kit rows with these ids, in the order of `ids` (a missing row is left out), with the owner's e-mail. */
export async function kitRowsById(ids: number[]): Promise<KitRow[]> {
  const rows = await query<{
    id: number;
    email: string;
    package_id: number;
    quantity: number | null;
    expires_on: string | null;
    expiry_precision: "month" | "day" | null;
  }>(
    `select k.id::float8 as id, u.email, k.package_id::float8 as package_id, k.quantity,
            to_char(k.expires_on, 'YYYY-MM-DD') as expires_on, k.expiry_precision
       from kit_items k join auth.users u on u.id = k.user_id where k.id = any($1::bigint[])`,
    [ids],
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row
      ? [
          {
            id,
            owner: row.email,
            packageId: row.package_id,
            quantity: row.quantity,
            expiresOn: row.expires_on,
            expiryPrecision: row.expiry_precision,
          },
        ]
      : [];
  });
}

/** The id (uuid) of the account with this e-mail, as the database stores it in `kit_items.user_id`. */
export async function userIdOf(email: string): Promise<string> {
  const [row] = await query<{ id: string }>("select id::text from auth.users where email = $1", [email]);
  return row.id;
}

// --- Checks ------------------------------------------------------------------------------------------------------

// Traces of the server's inside: table names, database error text, stack frames. The `issues` of a 400 (field path and
// message) describe the request, not the server, and are allowed.
const INTERNALS = [
  /kit_items/i,
  /registry_/i,
  /violates/i,
  /SQLSTATE/i,
  /syntax error/i,
  /\n\s+at /,
  /PostgrestError/i,
];

/** Text as Astro writes it into a page (the same escaping as `scripts/smoke.mjs`). */
export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Throws when the response body contains anything from the inside of the server. */
export function expectNoInternals(body: string): void {
  const hit = INTERNALS.find((pattern) => pattern.test(body));
  if (hit) {
    throw new Error(`The response leaks ${hit}: ${body.slice(0, 200)}`);
  }
}
