import type { NextRequest } from "next/server";
import { matchReadings } from "@/lib/scan";
import { getUsdToEur } from "@/lib/tcgdex";
import { parseLang } from "@/lib/types";
import { type ImageMediaType, readCardsFromPhoto, VisionError, visionConfigured } from "@/lib/vision";

// Analyse par l'IA puis rapprochement avec le catalogue : quelques secondes à quelques dizaines.
export const maxDuration = 60;

const MEDIA_TYPES: ImageMediaType[] = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;

/** Photo d'une ou plusieurs cartes (multipart : `image`, `lang`) → cartes lues et candidates du catalogue. */
export async function POST(request: NextRequest) {
  if (!visionConfigured()) {
    return Response.json({ error: "Identification par IA non configurée (ANTHROPIC_API_KEY)." }, { status: 501 });
  }
  const form = await request.formData().catch(() => null);
  const image = form?.get("image");
  if (!(image instanceof File)) return Response.json({ error: "Photo manquante." }, { status: 400 });
  if (image.size > MAX_BYTES) return Response.json({ error: "Photo trop lourde (8 Mo maximum)." }, { status: 413 });
  const mediaType = MEDIA_TYPES.find((t) => t === image.type);
  if (!mediaType) return Response.json({ error: "Format de photo non pris en charge (JPEG, PNG ou WebP)." }, { status: 415 });
  const lang = parseLang(form?.get("lang"));

  try {
    const data = Buffer.from(await image.arrayBuffer()).toString("base64");
    const readings = (await readCardsFromPhoto({ data, mediaType }, lang)).slice(0, 20);
    const detections = await matchReadings(readings, lang, await getUsdToEur());
    return Response.json({ detections });
  } catch (err) {
    if (err instanceof VisionError) return Response.json({ error: err.message }, { status: 502 });
    console.error(err);
    return Response.json({ error: "L'analyse de la photo a échoué, réessayez." }, { status: 500 });
  }
}
