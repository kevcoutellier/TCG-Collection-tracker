import type { NextRequest } from "next/server";
import { z } from "zod";
import { matchOcrText } from "@/lib/scan";
import { getUsdToEur } from "@/lib/tcgdex";

export const maxDuration = 60;

const body = z.object({ text: z.string().max(20000), lang: z.enum(["fr", "en", "ja"]) });

/** Texte lu par l'OCR du navigateur (mode sans IA) → cartes candidates, une par numéro « 199/165 » trouvé. */
export async function POST(request: NextRequest) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Requête invalide." }, { status: 400 });
  try {
    return Response.json({ detections: await matchOcrText(parsed.data.text, parsed.data.lang, await getUsdToEur()) });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Catalogue TCGdex indisponible, réessayez." }, { status: 502 });
  }
}
