// Fixtures for the medicine check rule tests: synthetic registry products, accounts and kit items inserted in one
// transaction that the test file always rolls back, so nothing is left behind and the result does not depend on the
// registry contents (any migrated local database works, with fixtures or with the full registry).
import { URL } from "node:url";
import pg from "pg";

// Local databases only: the rows are rolled back, but the inserts would still fire triggers and take locks elsewhere.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Connects to the local database named by `DATABASE_URL`; throws (never skips) when it is missing or not local. */
export async function connectLocal(): Promise<pg.Client> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set: the database tests need a local Supabase (npx supabase start)");
  }
  let host: string;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`DATABASE_URL must point to a local database (got host ${host})`);
  }
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  return client;
}

export interface ProductSpec {
  name: string;
  strength: string | null;
  form: string | null;
  commonName: string | null;
  /** Active substances in registry position order. */
  substances: string[];
  holder?: string | null;
  /** The product is withdrawn from the registry (removed_at set). */
  removed?: boolean;
  /** `units` of the product's own package (registry_packages.units). */
  units?: Record<string, string | null>[];
}

export interface ProductRef {
  id: number;
  /** The product's own active package. */
  packageId: number;
}

/** Filled in by `World.seed`: the id of the kit item, which the database generates. */
export interface KitRef {
  id: number;
}

interface KitSpec {
  ref: KitRef;
  user: string;
  packageId: number;
  quantity: number | null;
  expiresOn: string | null;
  precision: "month" | "day" | null;
}

/**
 * Collects synthetic rows, then inserts them in one go. Synthetic ids start far above the fixtures and the real
 * registry. A package id is the product id + 1000.
 */
export class World {
  private productSeq = 9_000_000_000;
  private extraPackageSeq = 9_000_002_000;
  private userSeq = 0;
  private readonly products: { ref: ProductRef; spec: ProductSpec }[] = [];
  private readonly extraPackages: { id: number; productId: number; removed: boolean }[] = [];
  private readonly users: string[] = [];
  private readonly kit: KitSpec[] = [];

  product(spec: ProductSpec): ProductRef {
    this.productSeq += 1;
    const ref = { id: this.productSeq, packageId: this.productSeq + 1000 };
    this.products.push({ ref, spec });
    return ref;
  }

  /** A further package of an existing product, active unless `removed`. */
  extraPackage(product: ProductRef, options: { removed?: boolean } = {}): number {
    this.extraPackageSeq += 1;
    this.extraPackages.push({ id: this.extraPackageSeq, productId: product.id, removed: options.removed ?? false });
    return this.extraPackageSeq;
  }

  /** A new account; every case gets its own, so it sees exactly its own kit. */
  user(): string {
    this.userSeq += 1;
    const id = `00000000-0000-4000-8000-${String(this.userSeq).padStart(12, "0")}`;
    this.users.push(id);
    return id;
  }

  kitItem(
    user: string,
    packageId: number,
    options: { quantity?: number; expiresOn?: string; precision?: "month" | "day" } = {},
  ): KitRef {
    const ref: KitRef = { id: 0 };
    this.kit.push({
      ref,
      user,
      packageId,
      quantity: options.quantity ?? null,
      expiresOn: options.expiresOn ?? null,
      precision: options.precision ?? null,
    });
    return ref;
  }

  /** Inserts everything as the table owner (RLS does not apply), then switches to the API role `authenticated`. */
  async seed(client: pg.Client): Promise<void> {
    for (const { ref, spec } of this.products) {
      await client.query(
        `insert into registry_products
           (id, name, strength, pharmaceutical_form, common_name, marketing_authorization_holder, removed_at)
         values ($1, $2, $3, $4, $5, $6, case when $7::boolean then now() end)`,
        [ref.id, spec.name, spec.strength, spec.form, spec.commonName, spec.holder ?? null, spec.removed ?? false],
      );
      for (const [index, substance] of spec.substances.entries()) {
        await client.query("insert into registry_product_substances (product_id, position, name) values ($1, $2, $3)", [
          ref.id,
          index + 1,
          substance,
        ]);
      }
      await client.query("insert into registry_packages (id, product_id, units) values ($1, $2, $3::jsonb)", [
        ref.packageId,
        ref.id,
        JSON.stringify(spec.units ?? []),
      ]);
    }
    for (const extra of this.extraPackages) {
      await client.query(
        "insert into registry_packages (id, product_id, removed_at) values ($1, $2, case when $3::boolean then now() end)",
        [extra.id, extra.productId, extra.removed],
      );
    }
    await client.query("insert into auth.users (id) select unnest($1::uuid[])", [this.users]);
    for (const item of this.kit) {
      // user_id is explicit because its default is auth.uid().
      const { rows } = await client.query<{ id: number }>(
        `insert into kit_items (user_id, package_id, quantity, expires_on, expiry_precision)
         values ($1, $2, $3, $4, $5) returning id::int as id`,
        [item.user, item.packageId, item.quantity, item.expiresOn, item.precision],
      );
      item.ref.id = rows[0].id;
    }
    await client.query("set local role authenticated");
  }
}

/** Calls the RPC as the API role `authenticated`, signed in as the given synthetic account. */
export async function checkAs(client: pg.Client, userId: string, productId: number): Promise<unknown> {
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
  const { rows } = await client.query<{ value: unknown }>("select public.medicine_check($1::bigint) as value", [
    productId,
  ]);
  return rows[0].value;
}
