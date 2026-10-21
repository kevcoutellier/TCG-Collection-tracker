import { authorizeCron } from "@/lib/cron";
import { refreshTrackedPrices } from "@/lib/snapshots";

/**
 * Relevé quotidien des prix de toutes les cartes suivies (collection + watchlist).
 * Appelé par le cron Vercel (voir vercel.ts) ; protégé par CRON_SECRET s'il est défini, sinon limité à un passage
 * par heure (voir lib/cron.ts).
 */
export async function GET() {
  const refused = await authorizeCron("snapshot");
  if (refused) return refused;
  const result = await refreshTrackedPrices();
  return Response.json({ ok: true, ...result });
}
