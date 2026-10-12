import type { NextRequest } from "next/server";
import { searchCardBriefs, searchJapaneseBriefs } from "@/lib/tcgdex";
import { parseLang } from "@/lib/types";

/** Recherche de cartes par nom pour les sélecteurs (comparateur, correction du scanner photo). */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim().slice(0, 80) ?? "";
  const lang = parseLang(request.nextUrl.searchParams.get("lang"));
  if (q.length < 2) return Response.json({ cards: [] });
  try {
    const briefs = lang === "ja" ? await searchJapaneseBriefs(q) : await searchCardBriefs(q, lang);
    return Response.json({ cards: briefs.slice(0, 30) });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Recherche TCGdex indisponible" }, { status: 502 });
  }
}
