import { headers } from "next/headers";
import { refreshTrackedPrices } from "@/lib/snapshots";

/**
 * Relevé quotidien des prix de toutes les cartes suivies (collection + watchlist).
 * Appelé par le cron Vercel (voir vercel.ts) ; protégé par CRON_SECRET s'il est défini.
 */
export async function GET() {
  const auth = (await headers()).get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }
  const result = await refreshTrackedPrices();
  return Response.json({ ok: true, ...result });
}
