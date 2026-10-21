import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { authorizeCron, claimCronRun, CRON_COOLDOWN_MS } from "./cron";
import { getDb, schema } from "./db";

// En-têtes de la requête simulée : seul l'en-tête Authorization compte ici.
let authorization: string | null = null;
vi.mock("next/headers", () => ({ headers: async () => new Headers(authorization ? { authorization } : {}) }));

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "pokefolio-cron-"));
  process.env.PGLITE_DIR = dir;
  await getDb();
}, 60_000);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  authorization = null;
});

/** Recule le dernier passage noté de la tâche, comme si le temps avait passé. */
async function age(name: string, seconds: number) {
  const db = await getDb();
  await db
    .update(schema.appMeta)
    .set({ value: sql`(now() - ${`${seconds} seconds`}::interval)::text` })
    .where(eq(schema.appMeta.key, `cronRun:${name}`));
}

describe("garde des tâches planifiées", () => {
  it("un passage par période, puis un nouveau une fois la période écoulée", async () => {
    expect(await claimCronRun("essai", CRON_COOLDOWN_MS)).toBe(true);
    expect(await claimCronRun("essai", CRON_COOLDOWN_MS)).toBe(false);
    // Les tâches sont comptées séparément.
    expect(await claimCronRun("autre", CRON_COOLDOWN_MS)).toBe(true);
    await age("essai", 3601);
    expect(await claimCronRun("essai", CRON_COOLDOWN_MS)).toBe(true);
  });

  it("un seul de deux appels simultanés passe", async () => {
    const results = await Promise.all([claimCronRun("simultane", CRON_COOLDOWN_MS), claimCronRun("simultane", CRON_COOLDOWN_MS)]);
    expect(results.sort()).toEqual([false, true]);
  });

  it("sans CRON_SECRET : route publique limitée à un passage par heure", async () => {
    expect(await authorizeCron("catalog")).toBeNull();
    await age("catalog", 600);
    const refused = await authorizeCron("catalog");
    expect(refused?.status).toBe(429);
    // Passé il y a 10 min : 50 min d'attente.
    const wait = Number(refused?.headers.get("retry-after"));
    expect(wait).toBeGreaterThan(2990);
    expect(wait).toBeLessThanOrEqual(3000);
    expect(await refused?.json()).toMatchObject({ ok: false, error: expect.stringContaining("50 min") });
  });

  it("avec CRON_SECRET : seul l'appel qui le présente passe, sans limite", async () => {
    process.env.CRON_SECRET = "secret-de-test";
    expect((await authorizeCron("snapshot"))?.status).toBe(401);
    authorization = "Bearer mauvais";
    expect((await authorizeCron("snapshot"))?.status).toBe(401);
    authorization = "Bearer secret-de-test";
    expect(await authorizeCron("snapshot")).toBeNull();
    expect(await authorizeCron("snapshot")).toBeNull();
  });
});
