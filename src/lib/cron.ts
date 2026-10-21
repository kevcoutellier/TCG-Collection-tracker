import { eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb, schema } from "./db";

// Garde des routes /api/cron/*. Avec CRON_SECRET (envoyé tel quel par Vercel Cron), seul l'appel qui le présente
// passe. Sans secret configuré, la route reste publique : un passage au plus par heure, pour qu'un inconnu ne puisse
// pas l'enchaîner (charge sur TCGdex, quotas Vercel et PokemonPriceTracker).

/** Délai minimal entre deux passages d'une même tâche quand aucun CRON_SECRET n'est configuré. */
export const CRON_COOLDOWN_MS = 60 * 60 * 1000;

const runKey = (name: string) => `cronRun:${name}`;
const interval = (ms: number) => `${Math.round(ms / 1000)} seconds`;

/**
 * Réserve un passage de la tâche si le précédent date d'au moins `cooldownMs`. Atomique : de deux appels
 * simultanés, un seul obtient la réservation.
 */
export async function claimCronRun(name: string, cooldownMs: number): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .insert(schema.appMeta)
    .values({ key: runKey(name), value: sql`now()::text` })
    .onConflictDoUpdate({
      target: schema.appMeta.key,
      set: { value: sql`excluded.value` },
      setWhere: sql`${schema.appMeta.value}::timestamptz <= now() - ${interval(cooldownMs)}::interval`,
    })
    .returning({ key: schema.appMeta.key });
  return rows.length > 0;
}

/** Secondes à attendre avant le prochain passage autorisé de la tâche (calculées par Postgres, qui a noté l'heure). */
async function secondsUntilNextRun(name: string, cooldownMs: number): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ wait: sql`ceil(extract(epoch from ${schema.appMeta.value}::timestamptz + ${interval(cooldownMs)}::interval - now()))::int` })
    .from(schema.appMeta)
    .where(eq(schema.appMeta.key, runKey(name)));
  return Math.max(1, Number(row?.wait ?? cooldownMs / 1000));
}

/** `null` si le passage est autorisé, sinon la réponse de refus à renvoyer telle quelle. */
export async function authorizeCron(name: string): Promise<Response | null> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = (await headers()).get("authorization");
    return auth === `Bearer ${secret}` ? null : Response.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (await claimCronRun(name, CRON_COOLDOWN_MS)) return null;
  const wait = await secondsUntilNextRun(name, CRON_COOLDOWN_MS);
  return Response.json(
    { ok: false, error: `Déjà lancé il y a moins d'une heure : réessayez dans ${Math.ceil(wait / 60)} min.` },
    { status: 429, headers: { "retry-after": String(wait) } },
  );
}
