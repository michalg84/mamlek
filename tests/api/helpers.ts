// Helpers of the API tests: a session over cookies (its own copy of scripts/smoke.mjs, which stays dependency-free),
// raw HTTP requests, boundary data picked from the local registry, and the checks every rejected request goes through.
import { connectLocal } from "../db/medicine-check-fixtures";

// Vitest itself sets BASE_URL to "/" (Vite's base path), so only an absolute URL counts as the caller's choice.
const fromEnv = process.env.BASE_URL;
export const BASE_URL = fromEnv?.startsWith("http") ? fromEnv.replace(/\/$/, "") : "http://localhost:4321";

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
}

export interface Reply {
  status: number;
  location: string;
  body: string;
}

export async function send(path: string, options: SendOptions = {}): Promise<Reply> {
  const jar = options.jar ?? new Map<string, string>();
  const headers: Record<string, string> = { Cookie: cookieHeader(jar), Origin: BASE_URL };
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

/** `POST` with a JSON body (an object is stringified, a string is sent as is). */
export function sendJson(path: string, body: unknown, jar?: Jar): Promise<Reply> {
  return send(path, {
    method: "POST",
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
  const signUp = await form("/api/auth/signup");
  if (signUp.status !== 302 || signUp.location !== "/auth/confirm-email") {
    throw new Error(
      `Sign-up of ${email} failed (status ${signUp.status}, location "${signUp.location}"). ` +
        "Locally the cause is usually the limit of 30 sign-ups and sign-ins per 5 minutes (supabase/config.toml) " +
        "or e-mail confirmation being on; wait a few minutes or restart Supabase.",
    );
  }
  const signIn = await form("/api/auth/signin");
  if (signIn.status !== 302 || signIn.location !== "/szukaj") {
    throw new Error(`Sign-in of ${email} failed (status ${signIn.status}, location "${signIn.location}")`);
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

export interface BoundaryData {
  /** An active pack with a size, its size and its product. */
  sized: { packageId: number; size: number; productId: number; productName: string };
  /** An active pack of an active product without a size. */
  unsized: { packageId: number };
  /** A withdrawn pack of an active product. */
  withdrawnPackage: { packageId: number };
  /** A pack of a withdrawn product. */
  withdrawnProductPackage: { packageId: number };
}

export async function loadBoundaryData(): Promise<BoundaryData> {
  const sized = await one<{ package_id: number; size: number; product_id: number; name: string }>(
    "active pack with a numeric size",
    `select pk.id::float8 as package_id, btrim(pk.units->0->>'count')::int as size, p.id::float8 as product_id, p.name
       from registry_packages pk join registry_products p on p.id = pk.product_id
      where pk.removed_at is null and p.removed_at is null and ${SIZE_SHAPE}
        and btrim(pk.units->0->>'count')::numeric between 1 and 99999
      order by pk.id limit 1`,
  );
  const unsized = await one<{ package_id: number }>(
    "active pack without a numeric size",
    `select pk.id::float8 as package_id
       from registry_packages pk join registry_products p on p.id = pk.product_id
      where pk.removed_at is null and p.removed_at is null and not (${SIZE_SHAPE})
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
  return {
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

/** Throws when the response body contains anything from the inside of the server. */
export function expectNoInternals(body: string): void {
  const hit = INTERNALS.find((pattern) => pattern.test(body));
  if (hit) {
    throw new Error(`The response leaks ${hit}: ${body.slice(0, 200)}`);
  }
}
