// Scanner photo (fonctions pures, utilisables côté client comme côté serveur) : lecture du numéro
// de collection dans un texte OCR, similarité de noms et classement des cartes candidates.
import type { Lang } from "./types";

/** Ce qui a été lu sur une carte de la photo (par l'IA ou l'OCR). */
export interface CardReading {
  name: string | null;
  /** Numéro avant la barre oblique, tel qu'imprimé (« 199 », « 025 », « TG05 »). */
  number: string | null;
  /** Nombre après la barre oblique (« 165 »). */
  total: number | null;
  setName: string | null;
  language: Lang | "other" | null;
  finish: "normal" | "holo" | "reverse" | "unknown";
  firstEdition: boolean;
  grading: { company: string; grade: string } | null;
  confidence: "high" | "medium" | "low";
  /** Position dans la photo (« en haut à gauche ») quand il y a plusieurs cartes. */
  position: string | null;
}

export interface CandidateVariant {
  key: string;
  label: string;
  type: string;
  price: number | null;
}

/** Carte du catalogue proposée pour une lecture, avec ce qu'il faut pour l'ajouter à la collection. */
export interface CardCandidate {
  id: string;
  lang: Lang;
  name: string;
  setName: string;
  localId: string;
  total: number | null;
  image: string | null;
  rarity: string | null;
  /** Sortie de l'extension : l'estimation d'une carte gradée en dépend (comme dans la collection). */
  releaseDate: string | null;
  variants: CandidateVariant[];
  /** Vraisemblance 0-1 (nom, numéro, total, extension). */
  score: number;
}

export interface ScanDetection {
  key: string;
  source: "vision" | "ocr";
  reading: CardReading;
  candidates: CardCandidate[];
}

export const EMPTY_READING: CardReading = {
  name: null,
  number: null,
  total: null,
  setName: null,
  language: null,
  finish: "unknown",
  firstEdition: false,
  grading: null,
  confidence: "low",
  position: null,
};

/* ------------------------------------------------------------------ */
/* Numéros                                                             */
/* ------------------------------------------------------------------ */

/** Forme comparable d'un numéro : majuscules, sans espaces ni zéros de tête (« 025 » → « 25 », « TG05 » → « TG5 »). */
export function normalizeNumber(n: string): string {
  return n
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/(^|\D)0+(?=\d)/g, "$1");
}

// Confusions fréquentes de l'OCR sur des chiffres.
const DIGIT_LOOKALIKES: Record<string, string> = { O: "0", o: "0", D: "0", Q: "0", l: "1", I: "1", i: "1", "|": "1", S: "5", s: "5", B: "8", Z: "2", z: "2", G: "6" };
const toDigits = (s: string) => s.replace(/[OoDQlIi|SsBZzG]/g, (c) => DIGIT_LOOKALIKES[c] ?? c);

/**
 * Numéros de collection « 199/165 » trouvés dans un texte OCR, sans doublon. Les lettres qui
 * ressemblent à des chiffres (O→0, l→1, S→5…) sont corrigées autour de la barre oblique.
 */
export function extractCardNumbers(text: string): { number: string; total: number }[] {
  const out: { number: string; total: number }[] = [];
  const re = /(?<![\w/])([0-9OoDQlIi|SsBZzG]{1,3})\s?[/⁄∕]\s?([0-9OoDQlIi|SsBZzG]{2,3})(?![\w/])/g;
  for (const m of text.matchAll(re)) {
    const left = toDigits(m[1]);
    const right = toDigits(m[2]);
    // Au moins un vrai chiffre de chaque côté, pour ne pas lire « IS/ISO » comme un numéro.
    if (!/\d/.test(m[1]) || !/\d/.test(m[2]) || !/^\d+$/.test(left) || !/^\d+$/.test(right)) continue;
    const total = Number(right);
    if (total < 10) continue;
    if (!out.some((o) => o.number === left && o.total === total)) out.push({ number: left, total });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Noms                                                                */
/* ------------------------------------------------------------------ */

export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9぀-ヿ㐀-鿿]+/g, " ")
    .trim();
}

function bigrams(s: string): Map<string, number> {
  const t = s.replace(/\s+/g, "");
  const m = new Map<string, number>();
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Similarité de Dice sur les bigrammes (0 à 1), tolérante aux fautes de lecture. */
export function nameSimilarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.replace(/\s/g, "").length < 2 || y.replace(/\s/g, "").length < 2) return 0;
  const bx = bigrams(x);
  const by = bigrams(y);
  let inter = 0;
  for (const [g, n] of bx) inter += Math.min(n, by.get(g) ?? 0);
  const total = [...bx.values()].reduce((a, n) => a + n, 0) + [...by.values()].reduce((a, n) => a + n, 0);
  return total ? (2 * inter) / total : 0;
}

/** Meilleure similarité entre un nom et un passage du texte lu (fenêtres de 1 à 3 mots). */
export function bestTextSimilarity(name: string, words: readonly string[]): number {
  let best = 0;
  for (let size = 1; size <= 3; size++) {
    for (let i = 0; i + size <= words.length; i++) {
      best = Math.max(best, nameSimilarity(name, words.slice(i, i + size).join(" ")));
      if (best === 1) return 1;
    }
  }
  return best;
}

/** Mots d'un texte OCR contenant au moins une lettre (les suffixes « ex », « V », « GX » comptent). */
export function ocrWords(text: string): string[] {
  return text
    .split(/[\s,.;:!?()[\]{}"«»]+/)
    .map((w) => w.trim())
    .filter((w) => /\p{L}/u.test(w))
    .slice(0, 400);
}

/* ------------------------------------------------------------------ */
/* Classement                                                          */
/* ------------------------------------------------------------------ */

/**
 * Vraisemblance qu'une carte du catalogue corresponde à la lecture : nom (ou texte OCR), numéro,
 * total imprimé et extension. Pondération : le numéro + total identifie presque à coup sûr.
 */
export function candidateScore(
  card: { name: string; localId: string; total: number | null; setName: string },
  reading: Pick<CardReading, "name" | "number" | "total" | "setName">,
  words: readonly string[] = [],
): number {
  const nameScore = reading.name ? nameSimilarity(card.name, reading.name) : words.length ? bestTextSimilarity(card.name, words) : 0;
  const numberMatch = reading.number != null && normalizeNumber(reading.number) === normalizeNumber(card.localId);
  const totalMatch = reading.total != null && card.total === reading.total;
  const setScore = reading.setName ? nameSimilarity(card.setName, reading.setName) : 0;
  const weights = { name: 0.45, number: 0.3, total: 0.15, set: reading.setName ? 0.1 : 0 };
  const sum = weights.name + weights.number + weights.total + weights.set;
  const raw = weights.name * nameScore + weights.number * Number(numberMatch) + weights.total * Number(totalMatch) + weights.set * setScore;
  return Math.round((raw / sum) * 100) / 100;
}

/** Variante la plus probable d'après la lecture (reverse, holo, 1re édition), sinon la première cotée. */
export function pickVariantKey(variants: readonly CandidateVariant[], reading: Pick<CardReading, "finish" | "firstEdition">): string | null {
  if (!variants.length) return null;
  const firstEd = (v: CandidateVariant) => /1re édition/i.test(v.label);
  const pool = reading.firstEdition ? variants.filter(firstEd) : variants.filter((v) => !firstEd(v));
  const list = pool.length ? pool : variants;
  const byType =
    reading.finish === "reverse"
      ? list.find((v) => v.type === "reverse" && !v.label.includes("·")) ?? list.find((v) => v.type === "reverse")
      : reading.finish === "holo"
        ? list.find((v) => v.type === "holo")
        : reading.finish === "normal"
          ? list.find((v) => v.type === "normal")
          : undefined;
  return (byType ?? list.find((v) => v.type !== "reverse" && v.price != null) ?? list[0]).key;
}
