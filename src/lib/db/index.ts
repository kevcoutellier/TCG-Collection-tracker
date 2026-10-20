import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
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
  /** Script appliqué (ou en cours d'application) par ce processus, et la promesse de cette application. */
  __pokefolioSchemaSql?: string;
  __pokefolioSchemaReady?: Promise<void>;
};

/** Version du schéma notée en base après application de BOOTSTRAP_SQL. */
const SCHEMA_KEY = "schemaVersion";
/** Verrou consultatif : deux instances qui démarrent ensemble n'appliquent pas le schéma en même temps. */
const SCHEMA_LOCK = 72_016_101;

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
  // Une seule application par processus : les requêtes lancées en parallèle au démarrage l'attendent toutes.
  if (globalForDb.__pokefolioSchemaSql !== schema.BOOTSTRAP_SQL) {
    globalForDb.__pokefolioSchemaSql = schema.BOOTSTRAP_SQL;
    globalForDb.__pokefolioSchemaReady = migrate(conn).catch((err) => {
      globalForDb.__pokefolioSchemaSql = undefined;
      throw err;
    });
  }
  await globalForDb.__pokefolioSchemaReady;
  return conn.db;
}

/**
 * Applique BOOTSTRAP_SQL si la base n'en a pas déjà cette version. Ses `ALTER TABLE` et `CREATE INDEX`, même sans
 * effet, verrouillent les tables jusqu'à la fin du script : relancés à chaque démarrage d'instance, ils bloquaient
 * mutuellement les requêtes des autres instances (deadlock sur holdings / collection_items).
 */
async function migrate(conn: Connection): Promise<void> {
  const version = createHash("sha256").update(schema.BOOTSTRAP_SQL).digest("hex").slice(0, 16);
  const current = await conn.db
    .select({ value: schema.appMeta.value })
    .from(schema.appMeta)
    .where(eq(schema.appMeta.key, SCHEMA_KEY))
    // Base neuve : la table n'existe pas encore.
    .catch(() => []);
  if (current[0]?.value === version) return;
  // Un seul script, donc une seule transaction : le verrou est relâché avec elle.
  await conn.exec(`SELECT pg_advisory_xact_lock(${SCHEMA_LOCK});
${schema.BOOTSTRAP_SQL}
INSERT INTO app_meta (key, value) VALUES ('${SCHEMA_KEY}', '${version}') ON CONFLICT (key) DO UPDATE SET value = excluded.value;`);
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
