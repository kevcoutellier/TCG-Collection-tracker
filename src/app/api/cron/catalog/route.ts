import { authorizeCron } from "@/lib/cron";
import { refreshCatalog } from "@/lib/catalog";

/** Le passage s'arrête de lui-même avant cette limite (voir `budgetMs`). */
export const maxDuration = 300;

/**
 * Copie quotidienne du catalogue TCGdex en base : listes des extensions, puis cartes et cotes des extensions dues.
 * Appelé par le cron Vercel (voir vercel.ts) ; protégé par CRON_SECRET s'il est défini, sinon limité à un passage
 * par heure (voir lib/cron.ts). Avec le secret, peut être relancé à la main pour une première copie complète :
 * chaque appel reprend où le précédent s'est arrêté (`remaining`).
 */
export async function GET() {
  const refused = await authorizeCron("catalog");
  if (refused) return refused;
  const result = await refreshCatalog({ budgetMs: 240_000 });
  return Response.json({ ok: true, ...result });
}
