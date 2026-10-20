import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type Db, getDb, schema } from "./index";

// Application du schéma au démarrage, sur une base PGlite jetable.
let dir: string;
const g = globalThis as unknown as Record<string, unknown>;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "pokefolio-db-"));
  process.env.PGLITE_DIR = dir;
  await getDb();
}, 60_000);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Démarrage d'une autre instance : schéma à revérifier (la connexion PGlite, unique, est gardée). */
async function otherInstance() {
  delete g.__pokefolioSchemaSql;
  delete g.__pokefolioSchemaReady;
  vi.resetModules();
  return (await import("./index")).getDb;
}

async function indexExists(db: Db) {
  const res = (await db.execute(sql`SELECT to_regclass('collection_items_user_set_idx') AS idx`)) as unknown as { rows: { idx: string | null }[] };
  return res.rows[0]?.idx != null;
}

// Chaque « autre instance » réapplique le schéma : plus lent que la limite par défaut quand les tests tournent en parallèle.
describe("schéma de la base", { timeout: 30_000 }, () => {
  it("note sa version après l'avoir appliqué", async () => {
    const db = await getDb();
    const [meta] = await db.select().from(schema.appMeta).where(eq(schema.appMeta.key, "schemaVersion"));
    expect(meta?.value).toMatch(/^[0-9a-f]{16}$/);
  });

  it("ne relance pas le script quand la base a déjà cette version", async () => {
    const db = await getDb();
    await db.execute(sql`DROP INDEX collection_items_user_set_idx`);
    await (await otherInstance())();
    expect(await indexExists(db)).toBe(false);

    await db.delete(schema.appMeta).where(eq(schema.appMeta.key, "schemaVersion"));
    await (await otherInstance())();
    expect(await indexExists(db)).toBe(true);
  });

  it("l'applique une seule fois pour des requêtes simultanées au démarrage", async () => {
    const db = await getDb();
    await db.delete(schema.appMeta).where(eq(schema.appMeta.key, "schemaVersion"));
    const conn = (await g.__pokefolioConn) as { exec: (sql: string) => Promise<unknown> };
    const exec = vi.spyOn(conn, "exec");
    const fresh = await otherInstance();
    await Promise.all([fresh(), fresh(), fresh()]);
    expect(exec).toHaveBeenCalledTimes(1);
    exec.mockRestore();
  });
});
