import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { CardReading } from "./scan-model";
import type { Lang } from "./types";

// Identification des cartes d'une photo par Claude (vision + sortie structurée).
// Optionnel : définir ANTHROPIC_API_KEY. Sans clé, le scanner lit la photo par OCR dans le navigateur.

export function visionConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const MODEL = process.env.CLAUDE_VISION_MODEL || "claude-opus-5-5";
// Repli automatique si le modèle décline la demande (modèles qui le prennent en charge uniquement).
const SUPPORTS_FALLBACK = /^claude-(?:fable-5-1|opus-5-5|opus-5|sonnet-5-5)$/.test(MODEL);

const ScannedCard = z.object({
  name: z.string().describe("Card name exactly as printed, in the card's own language, including suffixes such as ex, V, VMAX, VSTAR, GX, EX."),
  // Chaînes libres plutôt qu'enums : le SDK ne contraint pas les enums, une valeur imprévue ferait échouer la lecture.
  language: z.string().describe('Language the card is printed in: "fr", "en", "ja" or "other".'),
  number: z.string().nullable().describe("Collector number before the slash, exactly as printed (e.g. \"199\", \"025\", \"TG05\"). Null if unreadable."),
  total: z.number().int().nullable().describe("Number printed after the slash (e.g. 165). Null if there is none or it is unreadable."),
  setName: z.string().nullable().describe("Expansion name if you can tell it from the set symbol or text, otherwise null."),
  finish: z.string().describe('"normal", "holo" (holographic artwork only), "reverse" (holofoil everywhere except the artwork) or "unknown".'),
  firstEdition: z.boolean().describe("True if a 1st Edition stamp is visible."),
  grading: z
    .object({ company: z.string(), grade: z.string() })
    .nullable()
    .describe("For a graded slab: grading company (PSA, CGC, BGS, SGC, PCA, Collect Aura…) and grade as printed on the label (e.g. \"10\", \"9.5\")."),
  confidence: z.string().describe('How sure you are about the name and number: "high", "medium" or "low".'),
  position: z.string().nullable().describe("Where the card is in the photo, in French (e.g. \"en haut à gauche\"). Null if there is only one card."),
});

const ScanOutput = z.object({ cards: z.array(ScannedCard) });

const SYSTEM = `You read Pokémon Trading Card Game cards from photos for a collection-tracking app.
List every distinct physical Pokémon card visible (loose, sleeved, in a toploader or in a graded slab), in reading order (left to right, top to bottom). Ignore card backs, packaging and other objects.
For each card, report what is printed on it. The collector number sits at the bottom of the card (bottom left on modern cards, bottom right on older ones): read both sides of the slash carefully, digit by digit. Use null for anything you cannot read rather than guessing; the app matches your reading against the full card catalog and asks the user to confirm.
If there is no Pokémon card in the photo, return an empty list.`;

const LANG_HINT: Record<Lang, string> = { fr: "French", en: "English", ja: "Japanese" };

export class VisionError extends Error {}

function oneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  const v = value.trim().toLowerCase();
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp";

/** Lit les cartes visibles sur une photo ; lève une VisionError au message affichable. */
export async function readCardsFromPhoto(image: { data: string; mediaType: ImageMediaType }, langHint: Lang): Promise<CardReading[]> {
  const client = new Anthropic();
  let response;
  try {
    response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      ...(SUPPORTS_FALLBACK ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      // Lecture visuelle : peu de raisonnement nécessaire, on privilégie la rapidité.
      output_config: { effort: "low", format: betaZodOutputFormat(ScanOutput) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
            { type: "text", text: `Most cards in this collection are ${LANG_HINT[langHint]}, but report each card's actual language.` },
          ],
        },
      ],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new VisionError("Clé API Anthropic refusée : vérifiez ANTHROPIC_API_KEY.");
    }
    if (err instanceof Anthropic.RateLimitError) throw new VisionError("Trop de demandes d'analyse en même temps, réessayez dans un instant.");
    if (err instanceof Anthropic.BadRequestError) throw new VisionError("Photo refusée par le service d'analyse (format ou taille).");
    if (err instanceof Anthropic.APIError) throw new VisionError("Service d'analyse indisponible, réessayez plus tard.");
    throw err;
  }
  if (response.stop_reason === "refusal") throw new VisionError("L'analyse de cette photo a été refusée.");
  const output = response.parsed_output;
  if (!output) throw new VisionError("Réponse d'analyse illisible, réessayez.");
  return output.cards.map((c) => ({
    name: c.name.trim() || null,
    number: c.number?.trim() || null,
    total: c.total,
    setName: c.setName?.trim() || null,
    language: oneOf(c.language, ["fr", "en", "ja", "other"] as const, "other"),
    finish: oneOf(c.finish, ["normal", "holo", "reverse", "unknown"] as const, "unknown"),
    firstEdition: c.firstEdition,
    grading: c.grading?.company.trim() && c.grading.grade.trim() ? { company: c.grading.company.trim(), grade: c.grading.grade.trim() } : null,
    confidence: oneOf(c.confidence, ["high", "medium", "low"] as const, "low"),
    position: c.position?.trim() || null,
  }));
}
