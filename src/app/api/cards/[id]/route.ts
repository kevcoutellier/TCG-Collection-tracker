import type { NextRequest } from "next/server";
import { releaseDates, toCandidate } from "@/lib/scan";
import { getCard, getUsdToEur } from "@/lib/tcgdex";
import { parseLang } from "@/lib/types";

/** Détail d'une carte (variantes et cotes) au format du scanner, pour corriger une identification. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/cards/[id]">) {
  const { id: rawId } = await ctx.params;
  let id = rawId;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    // Identifiant déjà décodé ou mal formé : utilisé tel quel.
  }
  const lang = parseLang(request.nextUrl.searchParams.get("lang"));
  try {
    const [card, fx] = await Promise.all([getCard(id, lang), getUsdToEur()]);
    if (!card) return Response.json({ error: "Carte introuvable." }, { status: 404 });
    const releases = await releaseDates([card], lang);
    return Response.json({ card: toCandidate(card, lang, fx, 1, releases.get(card.set.id) ?? null) });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Catalogue TCGdex indisponible." }, { status: 502 });
  }
}
