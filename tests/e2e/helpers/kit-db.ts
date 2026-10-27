// Local database access for the E2E cleanup: the app has no route that removes a kit item until S-05, so a test that
// adds one deletes it here. Local databases only, like tests/db; a missing or non-local DATABASE_URL fails the run.
import pg from "pg";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

async function withLocalDb<T>(work: (client: pg.Client) => Promise<T>): Promise<T> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set: the E2E cleanup needs the local Supabase database (see .env.example)");
  }
  const host = new URL(databaseUrl).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`DATABASE_URL must point to a local database (got host ${host})`);
  }
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/** The database clock, so "created since" does not depend on the skew between the test machine and the database. */
export async function databaseNow(): Promise<Date> {
  return withLocalDb(async (client) => (await client.query<{ now: Date }>("select now()")).rows[0].now);
}

const KIT_ROWS_OF = `
  from kit_items k
  join auth.users u on u.id = k.user_id
  join registry_packages pk on pk.id = k.package_id
  join registry_products p on p.id = pk.product_id
 where u.email = $1 and p.name = $2`;

/** Deletes the kit items of this product that the account added since `since`; returns their ids. */
export async function deleteKitItemsSince(email: string, productName: string, since: Date): Promise<number[]> {
  return withLocalDb(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `delete from kit_items where id in (select k.id ${KIT_ROWS_OF} and k.created_at >= $3) returning id::text`,
      [email, productName, since],
    );
    return rows.map((row) => Number(row.id));
  });
}

/** Number of kit items of this product the account has. */
export async function countKitItems(email: string, productName: string): Promise<number> {
  return withLocalDb(async (client) => {
    const { rows } = await client.query<{ n: number }>(`select count(*)::int as n ${KIT_ROWS_OF}`, [
      email,
      productName,
    ]);
    return rows[0].n;
  });
}
