import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

interface Connection {
  db: Db;
  /** Exécute un script SQL de plusieurs instructions. */
  exec: (sql: string) => Promise<unknown>;
}

// Une seule connexion par processus (survit au rechargement à chaud en développement).
const globalForDb = globalThis as unknown as {
  __pokefolioConn?: Promise<Connection>;
  __pokefolioSchema?: string;
};

/**
 * - `DATABASE_URL` défini → Postgres (Neon, Supabase, local…), pour un déploiement.
 * - sinon → PGlite, un Postgres embarqué stocké dans `.data/pglite` : aucune installation requise.
 */
export async function getDb(): Promise<Db> {
  globalForDb.__pokefolioConn ??= connect().catch((err) => {
    globalForDb.__pokefolioConn = undefined;
    throw err;
  });
  const conn = await globalForDb.__pokefolioConn;
  // Schéma (ré)appliqué au démarrage et après chaque évolution du script (idempotent).
  if (globalForDb.__pokefolioSchema !== schema.BOOTSTRAP_SQL) {
    await conn.exec(schema.BOOTSTRAP_SQL);
    globalForDb.__pokefolioSchema = schema.BOOTSTRAP_SQL;
  }
  return conn.db;
}

async function connect(): Promise<Connection> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const client = postgres(url, { prepare: false, max: 5, onnotice: () => {} });
    return { db: drizzle(client, { schema }) as unknown as Db, exec: (sql) => client.unsafe(sql) };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  await mkdir(dir, { recursive: true });
  const client = await PGlite.create(dir);
  return { db: drizzle(client, { schema }) as unknown as Db, exec: (sql) => client.exec(sql) };
}

export { schema };
