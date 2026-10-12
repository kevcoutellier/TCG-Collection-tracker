// État des cartes détectées par le scanner (logique pure) : sélection de la bonne carte,
// variante, prix proposé, puis conversion en lignes de collection (doublons regroupés).
import { setAgeYears } from "@/lib/analysis";
import { GRADING_COMPANIES, gradeQuote } from "@/lib/graded-model";
import { type CardCandidate, type CardReading, EMPTY_READING, pickVariantKey, type ScanDetection } from "@/lib/scan-model";

export interface ScanRow {
  key: string;
  photoId: string | null;
  source: ScanDetection["source"] | "manual";
  reading: CardReading;
  candidates: CardCandidate[];
  candidateId: string | null;
  include: boolean;
  variantKey: string | null;
  quantity: string;
  condition: string;
  language: string;
  price: string;
  priceTouched: boolean;
  gradingCompany: string;
  grade: string;
}

/** Une identification est retenue d'office au-delà de ce score ; en dessous, l'utilisateur coche. */
export const AUTO_INCLUDE_SCORE = 0.55;

const LANGUAGE_CODE = { fr: "FR", en: "EN", ja: "JP", other: "OTHER" } as const;

function normalizeCompany(company: string): string {
  const c = company.trim();
  if (/beckett/i.test(c)) return "BGS";
  return GRADING_COMPANIES.find((g) => g.toLowerCase() === c.toLowerCase()) ?? c;
}

export function selectedCandidate(row: ScanRow): CardCandidate | null {
  return row.candidates.find((c) => c.id === row.candidateId) ?? null;
}

/** Cote d'une ligne : celle de la variante, ou l'estimation gradée pour une carte en slab (même calcul que la collection). */
export function suggestedPrice(row: Pick<ScanRow, "gradingCompany" | "grade">, candidate: CardCandidate | null, variantKey: string | null): number | null {
  const raw = candidate?.variants.find((v) => v.key === variantKey)?.price ?? null;
  if (row.gradingCompany && row.grade) {
    return gradeQuote(row.gradingCompany, row.grade, raw, setAgeYears(candidate?.releaseDate, new Date()), null).price;
  }
  return raw;
}

const priceText = (n: number | null) => (n != null ? n.toFixed(2) : "");

/** Choisit une carte pour la ligne : variante déduite de la lecture, prix proposé si non saisi. */
export function withCandidate(row: ScanRow, candidate: CardCandidate): ScanRow {
  const candidates = row.candidates.some((c) => c.id === candidate.id) ? row.candidates : [candidate, ...row.candidates];
  const variantKey = pickVariantKey(candidate.variants, row.reading);
  return {
    ...row,
    candidates,
    candidateId: candidate.id,
    variantKey,
    include: true,
    language: row.reading.language ? row.language : LANGUAGE_CODE[candidate.lang],
    price: row.priceTouched ? row.price : priceText(suggestedPrice(row, candidate, variantKey)),
  };
}

export function rowFromDetection(d: ScanDetection, photoId: string | null): ScanRow {
  const best = d.candidates[0] ?? null;
  const grading = d.reading.grading;
  const base: ScanRow = {
    key: `${photoId ?? "manual"}:${d.key}`,
    photoId,
    source: d.source,
    reading: d.reading,
    candidates: d.candidates,
    candidateId: null,
    include: false,
    variantKey: null,
    quantity: "1",
    condition: "NM",
    language: d.reading.language ? LANGUAGE_CODE[d.reading.language] : "FR",
    price: "",
    priceTouched: false,
    gradingCompany: grading ? normalizeCompany(grading.company) : "",
    grade: grading?.grade ?? "",
  };
  if (!best) return base;
  return { ...withCandidate(base, best), include: best.score >= AUTO_INCLUDE_SCORE };
}

export function manualRow(candidate: CardCandidate, key: string): ScanRow {
  return withCandidate(rowFromDetection({ key, source: "ocr", reading: EMPTY_READING, candidates: [] }, null), candidate);
}

/** Recalcule le prix proposé (variante ou note changée) tant que l'utilisateur ne l'a pas saisi. */
export function refreshPrice(row: ScanRow): ScanRow {
  return row.priceTouched ? row : { ...row, price: priceText(suggestedPrice(row, selectedCandidate(row), row.variantKey)) };
}

export interface ScannedItem {
  cardId: string;
  cardLang: CardCandidate["lang"];
  name: string;
  setName: string;
  image: string;
  rarity: string;
  variant: string;
  variantLabel: string;
  quantity: number;
  purchasePrice: number;
  condition: string;
  language: string;
  gradingCompany: string;
  grade: string;
}

/** Lignes cochées → cartes à ajouter ; une même carte dans le même état et au même prix est regroupée. */
export function rowsToItems(rows: readonly ScanRow[]): ScannedItem[] {
  const merged = new Map<string, ScannedItem>();
  for (const row of rows) {
    const c = selectedCandidate(row);
    if (!row.include || !c) continue;
    const variant = c.variants.find((v) => v.key === row.variantKey) ?? c.variants[0];
    const quantity = Math.max(1, Math.floor(Number(row.quantity) || 1));
    const price = Math.max(0, Number(row.price.replace(",", ".")) || 0);
    const graded = row.gradingCompany && row.grade;
    const item: ScannedItem = {
      cardId: c.id,
      cardLang: c.lang,
      name: c.name,
      setName: c.setName,
      image: c.image ?? "",
      rarity: c.rarity ?? "",
      variant: variant?.key ?? "normal",
      variantLabel: variant?.label ?? "",
      quantity,
      purchasePrice: Math.round(price * 100) / 100,
      condition: row.condition,
      language: row.language,
      gradingCompany: graded ? row.gradingCompany : "",
      grade: graded ? row.grade : "",
    };
    const key = [item.cardLang, item.cardId, item.variant, item.condition, item.language, item.gradingCompany, item.grade, item.purchasePrice].join("|");
    const existing = merged.get(key);
    if (existing) existing.quantity += quantity;
    else merged.set(key, item);
  }
  return [...merged.values()];
}
