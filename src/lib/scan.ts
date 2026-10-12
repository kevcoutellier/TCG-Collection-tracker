import { mapLimit } from "./async";
import { cardVariants } from "./pricing";
import {
  type CardCandidate,
  type CardReading,
  candidateScore,
  EMPTY_READING,
  extractCardNumbers,
  normalizeNumber,
  ocrWords,
  type ScanDetection,
} from "./scan-model";
import { getSet, getSetList, hydrateCards, searchCardBriefs, searchJapaneseBriefs } from "./tcgdex";
import type { CardBrief, CardDetail, Lang } from "./types";

// Rapprochement des lectures du scanner photo avec le catalogue TCGdex : par numéro et total
// imprimés (« 199/165 » désigne une carte dans une poignée d'extensions), puis par nom.

const MAX_CANDIDATES = 5;

export function toCandidate(card: CardDetail, lang: Lang, fx: number, score = 1, releaseDate: string | null = null): CardCandidate {
  return {
    id: card.id,
    lang,
    name: card.name,
    setName: card.set.name,
    localId: card.localId,
    total: card.set.cardCount?.official ?? null,
    image: card.image ?? null,
    rarity: card.rarity ?? null,
    releaseDate,
    variants: cardVariants(card, fx).map((v) => ({ key: v.key, label: v.label, type: v.type, price: v.price.price })),
    score,
  };
}

/** Date de sortie des extensions de ces cartes (requêtes en cache). */
export async function releaseDates(cards: readonly CardDetail[], lang: Lang): Promise<Map<string, string | null>> {
  const ids = [...new Set(cards.map((c) => c.set.id))];
  const sets = await mapLimit(ids, 4, (id) => getSet(id, lang).catch(() => null));
  return new Map(ids.map((id, i) => [id, sets[i]?.releaseDate ?? null]));
}

/** Cartes portant ce numéro dans les extensions dont le nombre de cartes imprimé correspond. */
async function briefsByNumber(number: string, total: number, lang: Lang): Promise<CardBrief[]> {
  const sets = (await getSetList(lang)).filter((s) => s.cardCount?.official === total).slice(-12);
  const wanted = normalizeNumber(number);
  const found = await mapLimit(sets, 6, async (s) => {
    const set = await getSet(s.id, lang).catch(() => null);
    return set?.cards.find((c) => normalizeNumber(c.localId) === wanted) ?? null;
  });
  return found.filter((c): c is CardBrief => c !== null);
}

/** Catalogues à interroger : langue lue sur la carte (repli anglais pour une carte française), sinon langue choisie. */
function catalogLangs(detected: CardReading["language"], hint: Lang): Lang[] {
  if (detected === "fr") return ["fr", "en"];
  if (detected === "en" || detected === "ja") return [detected];
  return hint === "en" ? ["en"] : [hint, "en"];
}

export async function matchReading(reading: CardReading, opts: { lang: Lang; fx: number; words?: string[] }): Promise<CardCandidate[]> {
  const words = opts.words ?? [];
  for (const lang of catalogLangs(reading.language, opts.lang)) {
    const pool = new Map<string, CardBrief>();
    if (reading.number && reading.total) {
      for (const b of await briefsByNumber(reading.number, reading.total, lang).catch(() => [])) pool.set(b.id, b);
    }
    if (reading.name && reading.name.trim().length >= 2) {
      const byName = await (lang === "ja" ? searchJapaneseBriefs(reading.name) : searchCardBriefs(reading.name, lang)).catch(() => []);
      for (const b of byName) pool.set(b.id, b);
    }
    if (!pool.size) continue;

    // Pré-classement sur le nom et le numéro (sans requête), puis détail des meilleures candidates.
    const partial = { ...reading, total: null, setName: null };
    const shortlist = [...pool.values()]
      .map((b) => ({ id: b.id, score: candidateScore({ name: b.name, localId: b.localId, total: null, setName: "" }, partial, words) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    const cards = await hydrateCards(
      shortlist.map((s) => s.id),
      lang,
    );
    const releases = await releaseDates(cards, lang);
    const ranked = cards
      .map((c) =>
        toCandidate(
          c,
          lang,
          opts.fx,
          candidateScore({ name: c.name, localId: c.localId, total: c.set.cardCount?.official ?? null, setName: c.set.name }, reading, words),
          releases.get(c.set.id) ?? null,
        ),
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_CANDIDATES);
    if (ranked.length) return ranked;
  }
  return [];
}

/** Lectures issues de l'IA : une détection par carte vue sur la photo. */
export async function matchReadings(readings: CardReading[], lang: Lang, fx: number): Promise<ScanDetection[]> {
  return mapLimit(readings, 4, async (reading, i) => ({
    key: `v${i}`,
    source: "vision" as const,
    reading,
    candidates: await matchReading(reading, { lang, fx }).catch(() => []),
  }));
}

/** Texte OCR d'une photo : un numéro « 199/165 » lu = une carte, départagée par les mots lus. */
export async function matchOcrText(text: string, lang: Lang, fx: number): Promise<ScanDetection[]> {
  const numbers = extractCardNumbers(text).slice(0, 9);
  const words = ocrWords(text);
  if (!numbers.length) return [{ key: "o0", source: "ocr", reading: EMPTY_READING, candidates: [] }];
  return mapLimit(numbers, 3, async ({ number, total }, i) => {
    const reading: CardReading = { ...EMPTY_READING, number, total, language: lang };
    return { key: `o${i}`, source: "ocr" as const, reading, candidates: await matchReading(reading, { lang, fx, words }).catch(() => []) };
  });
}
