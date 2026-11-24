// Helpers of the API tests: a session over cookies (its own copy of scripts/smoke.mjs, which stays dependency-free),
// raw HTTP requests, boundary data picked from the local registry, and the checks every rejected request goes through.
import { packQuantity } from "@/lib/kit-format";
import type { RegistryPackageUnit } from "@/types";
import { connectLocal, LOCAL_HOSTS } from "../db/medicine-check-fixtures";
import { resolveBaseUrl } from "./base-url";

// The caller's server comes from API_BASE_URL (Vitest overwrites BASE_URL with "/", see ./base-url).
export const BASE_URL = resolveBaseUrl(process.env);

// Local servers only: the suite signs up accounts and writes kit rows, and checks them in the local database.
if (!LOCAL_HOSTS.has(new URL(BASE_URL).hostname)) {
  throw new Error(`API_BASE_URL must point to a local server (got ${BASE_URL})`);
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
  // With e-mail confirmation on, sign-up succeeds without a session (it answers /auth/confirm-email) and sign-in is
  // refused ("Email not confirmed"); with it off, sign-up answers /szukaj.
  const confirmation = "e-mail confirmation being on (enable_confirmations in supabase/config.toml)";
  const signUp = await form("/api/auth/signup");
  if (signUp.status !== 302 || signUp.location !== "/szukaj") {
    throw new Error(
      `Sign-up of ${email} failed (status ${signUp.status}, location "${signUp.location}"). ` +
        `Locally the cause is usually ${signUp.location === "/auth/confirm-email" ? confirmation : limit}.`,
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

// Active = the pack and its product are not withdrawn. A pack "with a size" is one `packQuantity` gives a size: the
// rule of the screen (a quantity above it is saved with a warning; the API caps only at MAX_QUANTITY). The size is
// computed by that same function, never re-encoded in SQL, so the boundaries follow the rule (e.g. "1 butelka 90 tabl." has a size of 90, "12 tabl." of 12, "4 fiol. 5 ml" of 4).

interface PackRow {
  package_id: number;
  product_id: number;
  units: RegistryPackageUnit[];
}

/** The size of a pack as the app computes it, or null when the pack has none. */
function sizeOf(pack: PackRow): number | null {
  return packQuantity(pack.units).max;
}

/** The size of a pack lies in lo..hi. */
function sizeIn(pack: PackRow, lo: number, hi: number): boolean {
  const size = sizeOf(pack);
  return size !== null && size >= lo && size <= hi;
}

/** The first pack (rows come ordered by id) that passes `test`, or an error naming what the registry lacks. */
function first<T extends PackRow>(what: string, rows: T[], test: (pack: T) => boolean): T {
  const found = rows.find(test);
  if (!found) {
    throw new Error(`The local registry has no ${what}: import the fixtures (see AGENTS.md, registry:import)`);
  }
  return found;
}

export interface BoundaryData {
  /** An active pack with a size of at least 3 (the PATCH tests store a quantity of 3), its size and its product. */
  sized: { packageId: number; size: number; productId: number; productName: string };
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
  const activePacks = await query<PackRow & { name: string }>(
    `select pk.id::float8 as package_id, p.id::float8 as product_id, pk.units, p.name
       from registry_packages pk join registry_products p on p.id = pk.product_id
      where pk.removed_at is null and p.removed_at is null
      order by pk.id`,
  );
  const sized = first("active pack with a size from 3 to 99999", activePacks, (pack) => sizeIn(pack, 3, 99999));
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
  // First by (small id, large id), like an ordered join of the packs with each other.
  const packsOfProduct = new Map<number, PackRow[]>();
  for (const pack of activePacks) {
    packsOfProduct.set(pack.product_id, [...(packsOfProduct.get(pack.product_id) ?? []), pack]);
  }
  let siblings: { small: PackRow; large: PackRow } | null = null;
  for (const small of activePacks) {
    if (!sizeIn(small, 1, 99998)) {
      continue;
    }
    const smallSize = sizeOf(small) ?? 0;
    const large = (packsOfProduct.get(small.product_id) ?? []).find(
      (pack) =>
        pack.product_id === small.product_id &&
        pack.package_id !== small.package_id &&
        sizeIn(pack, 2, 99999) &&
        (sizeOf(pack) ?? 0) > smallSize,
    );
    if (large) {
      siblings = { small, large };
      break;
    }
  }
  if (siblings === null) {
    throw new Error(
      "The local registry has no product with two active packs of different sizes: import the fixtures (see AGENTS.md, registry:import)",
    );
  }
  const siblingsProductId = siblings.small.product_id;
  const otherVariants = await query<PackRow>(
    `select pk.id::float8 as package_id, p.id::float8 as product_id, pk.units
       from registry_packages pk
       join registry_products p on p.id = pk.product_id
       join registry_products base on base.id = $1
      where pk.removed_at is null and p.removed_at is null
        and not (lower(p.name) = lower(base.name)
             and lower(coalesce(p.strength, '')) = lower(coalesce(base.strength, ''))
             and lower(coalesce(p.pharmaceutical_form, '')) = lower(coalesce(base.pharmaceutical_form, '')))
      order by pk.id`,
    [siblingsProductId],
  );
  const otherVariant = first(
    "active pack with a size of another variant",
    otherVariants,
    (pack) => sizeOf(pack) !== null,
  );
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
    [siblingsProductId],
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
    [siblingsProductId],
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
  const withdrawnPacks = await query<PackRow>(
    `select pk.id::float8 as package_id, p.id::float8 as product_id, pk.units
       from registry_packages pk join registry_products p on p.id = pk.product_id
      where pk.removed_at is not null and p.removed_at is null
      order by pk.id`,
  );
  const withdrawnSized = first("withdrawn pack with a size of an active product", withdrawnPacks, (pack) =>
    sizeIn(pack, 1, 99999),
  );
  return {
    siblings: {
      productId: siblingsProductId,
      small: { packageId: siblings.small.package_id, size: sizeOf(siblings.small) ?? 0 },
      large: { packageId: siblings.large.package_id, size: sizeOf(siblings.large) ?? 0 },
    },
    otherVariant: { packageId: otherVariant.package_id },
    otherVariantWithdrawn: { packageId: otherVariantsWithdrawn[0].package_id },
    siblingWithdrawn: { packageId: siblingsWithdrawn[0].package_id },
    withdrawnProductPair: {
      from: { packageId: withdrawnProductPair.from_id },
      to: { packageId: withdrawnProductPair.to_id },
    },
    withdrawnSized: { packageId: withdrawnSized.package_id, size: sizeOf(withdrawnSized) ?? 0 },
    sized: {
      packageId: sized.package_id,
      size: sizeOf(sized) ?? 0,
      productId: sized.product_id,
      productName: sized.name,
    },
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

/** How many accounts have this e-mail (0 or 1): the proof that a refused sign-up created nothing. */
export async function accountCount(email: string): Promise<number> {
  const [row] = await query<{ n: number }>("select count(*)::int as n from auth.users where email = $1", [email]);
  return row.n;
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
