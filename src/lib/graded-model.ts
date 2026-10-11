// Cotes des cartes gradées : échelles de notes, ventes réelles et modèle d'estimation (fonctions pures,
// utilisables côté client comme côté serveur).

export const GRADING_SCALES = {
  PSA: ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1"],
  CGC: ["10 Pristine", "10", "9.5", "9", "8.5", "8", "7"],
  BGS: ["10 Black Label", "10", "9.5", "9", "8.5", "8", "7"],
  SGC: ["10", "9.5", "9", "8", "7"],
  PCA: ["10", "9.5", "9", "8.5", "8", "7"],
  "Collect Aura": ["10", "9.5", "9", "8.5", "8", "7"],
} as const satisfies Record<string, readonly string[]>;

export type GradingCompany = keyof typeof GRADING_SCALES;
export const GRADING_COMPANIES = Object.keys(GRADING_SCALES) as GradingCompany[];

export function isGradingCompany(v: unknown): v is GradingCompany {
  return typeof v === "string" && v in GRADING_SCALES;
}

/** Statistiques de ventes réelles pour une note (prix en EUR). */
export interface GradeSale {
  price: number;
  count: number | null;
  lastSale: string | null;
}

/** Ventes par note, clé « PSA 10 », « CGC 9.5 »… */
export type SalesByGrade = Record<string, GradeSale>;

export interface GradeQuote {
  company: string;
  grade: string;
  price: number | null;
  source: "sales" | "estimate" | null;
  count?: number | null;
  lastSale?: string | null;
}

export const gradeKey = (company: string, grade: string) => `${company} ${grade}`;

// Valeur d'une carte gradée PSA (note 1 à 10) en multiple de la cote brute, selon l'époque.
// Ordres de grandeur observés sur les ventes : un PSA 10 moderne vaut ~2-3× la carte brute,
// un PSA 10 vintage beaucoup plus car les exemplaires parfaits sont rarissimes.
const CURVES = {
  modern: [0.2, 0.25, 0.3, 0.35, 0.42, 0.5, 0.65, 0.8, 1.05, 2.4],
  recent: [0.25, 0.3, 0.35, 0.42, 0.5, 0.6, 0.75, 0.95, 1.3, 3.2],
  older: [0.3, 0.35, 0.42, 0.5, 0.6, 0.75, 0.9, 1.2, 2, 6],
  vintage: [0.35, 0.45, 0.55, 0.65, 0.8, 0.95, 1.2, 1.8, 3.5, 15],
};

export type Era = keyof typeof CURVES;

export function eraOf(ageYears: number | null): Era {
  if (ageYears == null) return "recent";
  if (ageYears >= 20) return "vintage";
  if (ageYears >= 12) return "older";
  if (ageYears >= 6) return "recent";
  return "modern";
}

/** Une carte gradée se revend rarement sous ces montants (coût du grading + demande des slabs). */
function floorFor(eq: number) {
  if (eq >= 10) return 25;
  if (eq >= 9) return 15;
  if (eq >= 8) return 10;
  return 6;
}

/** Équivalence d'une note de chaque société avec l'échelle PSA, et décote/prime de marché. */
function companyAdjust(company: string, grade: string): { eq: number; factor: number } {
  const g = Number.parseFloat(grade);
  switch (company) {
    case "PSA":
      return { eq: g, factor: 1 };
    case "BGS":
      if (grade === "10 Black Label") return { eq: 10, factor: 2.5 };
      if (g === 10) return { eq: 10, factor: 1.15 };
      if (g === 9.5) return { eq: 10, factor: 0.65 };
      return { eq: g, factor: 0.9 };
    case "CGC":
      if (grade === "10 Pristine") return { eq: 10, factor: 1.05 };
      if (g === 10) return { eq: 10, factor: 0.75 };
      if (g === 9.5) return { eq: 10, factor: 0.5 };
      return { eq: g, factor: 0.85 };
    case "SGC":
      if (g === 10) return { eq: 10, factor: 0.8 };
      if (g === 9.5) return { eq: 10, factor: 0.55 };
      return { eq: g, factor: 0.85 };
    case "PCA":
      if (g === 10) return { eq: 10, factor: 0.55 };
      if (g === 9.5) return { eq: 10, factor: 0.4 };
      return { eq: g, factor: 0.75 };
    case "Collect Aura":
      if (g === 10) return { eq: 10, factor: 0.5 };
      if (g === 9.5) return { eq: 10, factor: 0.38 };
      return { eq: g, factor: 0.7 };
    default:
      return { eq: g, factor: 0.6 };
  }
}

function curveAt(era: Era, eq: number) {
  const curve = CURVES[era];
  const x = Math.min(10, Math.max(1, Number.isFinite(eq) ? eq : 1));
  const lo = Math.floor(x);
  const hi = Math.ceil(x);
  if (lo === hi) return curve[lo - 1];
  return curve[lo - 1] + (curve[hi - 1] - curve[lo - 1]) * (x - lo);
}

/** Estimation d'une carte gradée à partir de sa cote brute. */
export function estimateGradedPrice(raw: number | null, company: string, grade: string, ageYears: number | null): number | null {
  if (raw == null || raw <= 0) return null;
  const { eq, factor } = companyAdjust(company, grade);
  const value = Math.max(raw * curveAt(eraOf(ageYears), eq), floorFor(eq)) * factor;
  return Math.round(value * 100) / 100;
}

/** Cote d'une note : ventes réelles si disponibles, sinon estimation. */
export function gradeQuote(
  company: string,
  grade: string,
  raw: number | null,
  ageYears: number | null,
  sales: SalesByGrade | null | undefined,
): GradeQuote {
  const sale = sales?.[gradeKey(company, grade)];
  if (sale) return { company, grade, price: sale.price, source: "sales", count: sale.count, lastSale: sale.lastSale };
  const est = estimateGradedPrice(raw, company, grade, ageYears);
  return { company, grade, price: est, source: est != null ? "estimate" : null };
}

/** Lit la réponse « salesByGrade » (clés psa10, cgc9_5, bgs10…) et convertit en EUR. */
export function parseSalesByGrade(raw: unknown, usdToEur: number): SalesByGrade | null {
  if (!raw || typeof raw !== "object") return null;
  const out: SalesByGrade = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const m = /^(psa|bgs|cgc|sgc|tag|ace)(\d+)(?:_(\d))?$/i.exec(k);
    if (!m || !v || typeof v !== "object") continue;
    const stat = v as {
      medianPrice?: number;
      averagePrice?: number;
      avg?: number;
      smartMarketPrice?: { price?: number } | number;
      count?: number;
      salesCount?: number;
      lastSaleDate?: string;
    };
    const smart = typeof stat.smartMarketPrice === "number" ? stat.smartMarketPrice : stat.smartMarketPrice?.price;
    const usd = stat.medianPrice ?? smart ?? stat.averagePrice ?? stat.avg;
    if (typeof usd !== "number" || !(usd > 0)) continue;
    const company = m[1].toUpperCase();
    const grade = m[3] ? `${m[2]}.${m[3]}` : m[2];
    out[gradeKey(company, grade)] = {
      price: Math.round(usd * usdToEur * 100) / 100,
      count: stat.count ?? stat.salesCount ?? null,
      lastSale: stat.lastSaleDate ?? null,
    };
  }
  return Object.keys(out).length ? out : null;
}
