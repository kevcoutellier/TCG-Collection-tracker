// Moteur d'analyse : fonctions pures (sans I/O) pour les cartes, le portefeuille et les simulateurs.
import type { PriceInfo, VariantKey } from "./types";

/* ------------------------------------------------------------------ */
/* Outils                                                              */
/* ------------------------------------------------------------------ */

export function pct(from: number | null | undefined, to: number | null | undefined): number | null {
  return from != null && to != null && from > 0 ? to / from - 1 : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Ajoute `n` jours à une date ISO « AAAA-MM-JJ » (calcul en UTC pour éviter les décalages). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Frais de vente                                                      */
/* ------------------------------------------------------------------ */

/** Hypothèses par défaut : commission Cardmarket vendeur particulier + envoi lettre suivie. */
export const DEFAULT_FEES = { rate: 0.05, shipping: 1.5 };

export function netFromSale(price: number, rate = DEFAULT_FEES.rate, shipping = DEFAULT_FEES.shipping) {
  return price * (1 - rate) - shipping;
}

/** Prix de vente minimum pour récupérer `cost` après commission et envoi. */
export function breakEvenPrice(cost: number, rate = DEFAULT_FEES.rate, shipping = DEFAULT_FEES.shipping) {
  return (cost + shipping) / (1 - rate);
}

/* ------------------------------------------------------------------ */
/* Analyse d'une carte                                                 */
/* ------------------------------------------------------------------ */

export interface Momentum {
  /** Tendance actuelle vs moyenne des ventes sur 30 jours. */
  vs30: number | null;
  /** Tendance actuelle vs moyenne 7 jours. */
  vs7: number | null;
  /** Moyenne 24 h vs moyenne 7 jours. */
  day: number | null;
}

export function momentum(p: PriceInfo): Momentum {
  const now = p.trend ?? p.price;
  return { vs30: pct(p.avg30, now), vs7: pct(p.avg7, now), day: pct(p.avg7, p.avg1) };
}

// Pokémon les plus recherchés (noms FR et EN), d'après les ventes records et la demande récurrente.
const POPULAR_S = [
  "dracaufeu", "charizard", "pikachu", "noctali", "umbreon", "mewtwo", "mew", "rayquaza", "lugia",
  "ectoplasma", "gengar", "evoli", "eevee", "nymphali", "sylveon", "mentali", "espeon", "pyroli",
  "flareon", "aquali", "vaporeon", "voltali", "jolteon", "phyllali", "leafeon", "givrali", "glaceon",
  "giratina", "amphinobi", "greninja", "leviator", "gyarados", "magicarpe", "magikarp", "tortank",
  "blastoise", "florizarre", "venusaur", "dracolosse", "dragonite", "ronflex", "snorlax", "darkrai",
  "lucario", "arceus",
];
const POPULAR_A = [
  "salameche", "charmander", "carapuce", "squirtle", "bulbizarre", "bulbasaur", "lokhlass", "lapras",
  "absol", "zoroark", "mimiqui", "mimikyu", "psykokwak", "psyduck", "kyogre", "groudon", "ho-oh",
  "suicune", "celebi", "jirachi", "latias", "latios", "zekrom", "reshiram", "dialga", "palkia",
  "gardevoir", "tyranocif", "tyranitar", "alakazam", "metamorph", "ditto", "rondoudou", "jigglypuff",
  "raichu", "togepi", "deoxys", "miraidon", "koraidon", "terapagos", "zacian", "zamazenta", "riolu",
  "carchacrok", "garchomp", "gallame", "gallade", "marshadow", "zeraora", "shaymin", "kyurem",
];

export type PopularityTier = "S" | "A" | "B";

export function popularityTier(name: string): PopularityTier {
  const n = normalize(name);
  if (POPULAR_S.some((p) => n.includes(p))) return "S";
  if (POPULAR_A.some((p) => n.includes(p))) return "A";
  return "B";
}

export type RarityTier = "top" | "high" | "mid" | "low" | "unknown";

const RARITY_TOP = [
  "speciale", "special", "hyper", "magnifique", "secret", "noir blanc", "black white", "rainbow",
  "gold", "crown", "couronne", "legend",
];
const RARITY_HIGH = [
  "illustration rare", "ultra", "chromatique", "shiny", "radieux", "radiant", "amazing", "full art",
  "prime", "lv.x", "break", "vmax", "vstar", "ace spec",
];

export function rarityTier(rarity: string | null | undefined, name = ""): RarityTier {
  const r = normalize(rarity ?? "");
  const n = normalize(name);
  // Étoiles dorées (☆) et cartes « brillantes » (Shining) de l'ère vintage.
  if (/[☆★]/.test(name) || n.includes("brillant") || n.includes("shining")) return "top";
  if (!r) return "unknown";
  if (RARITY_TOP.some((k) => r.includes(k)) || /\bstar\b/.test(r)) return "top";
  if (RARITY_HIGH.some((k) => r.includes(k))) return "high";
  if (r.includes("peu commune") || r.includes("uncommon") || r.includes("commune") || r.includes("common"))
    return "low";
  if (r.includes("double") || r.includes("holo") || r.includes("rare")) return "mid";
  return "unknown";
}

export function setAgeYears(releaseDate: string | null | undefined, now: Date): number | null {
  if (!releaseDate) return null;
  const t = Date.parse(releaseDate);
  if (Number.isNaN(t)) return null;
  return (now.getTime() - t) / (365.25 * 24 * 3600 * 1000);
}

export type SignalKind = "bullish" | "opportunity" | "bearish" | "neutral" | "unknown";

export interface Reason {
  tone: "positive" | "negative" | "neutral";
  text: string;
}

export interface CardAnalysis {
  /** Score d'attractivité 0-100 (rareté, demande, dynamique, liquidité, ancienneté). */
  score: number;
  signal: { kind: SignalKind; label: string };
  momentum: Momentum;
  rarity: RarityTier;
  popularity: PopularityTier;
  reasons: Reason[];
  /** Prix de revente minimal pour rentrer dans ses frais si l'on achète au prix actuel. */
  breakEven: number | null;
}

const RARITY_POINTS: Record<RarityTier, number> = { top: 30, high: 22, mid: 12, low: 3, unknown: 8 };
const POPULARITY_POINTS: Record<PopularityTier, number> = { S: 25, A: 16, B: 6 };
const MAX_POINTS = 30 + 25 + 15 + 15 + 10;

const fmtPct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n * 100).toFixed(1).replace(".", ",")} %`;

export function analyzeCard(
  input: { name: string; rarity?: string | null; releaseDate?: string | null; price: PriceInfo },
  now: Date = new Date(),
): CardAnalysis {
  const { name, price: p } = input;
  const m = momentum(p);
  const rarity = rarityTier(input.rarity, name);
  const popularity = popularityTier(name);
  const age = setAgeYears(input.releaseDate, now);
  const reasons: Reason[] = [];

  let points = RARITY_POINTS[rarity] + POPULARITY_POINTS[popularity];

  if (rarity === "top") reasons.push({ tone: "positive", text: `Rareté haut de gamme (${input.rarity ?? "édition spéciale"}) : tirage très limité.` });
  else if (rarity === "high") reasons.push({ tone: "positive", text: `Rareté élevée (${input.rarity}).` });
  else if (rarity === "low") reasons.push({ tone: "negative", text: "Carte commune : offre abondante, faible potentiel de valorisation." });

  if (popularity === "S") reasons.push({ tone: "positive", text: "Pokémon parmi les plus recherchés : demande soutenue sur le long terme." });
  else if (popularity === "A") reasons.push({ tone: "positive", text: "Pokémon populaire auprès des collectionneurs." });

  // Dynamique de prix : tendance vs moyenne 30 jours.
  if (m.vs30 != null) {
    if (m.vs30 > 0.15) points += 12;
    else if (m.vs30 > 0.05) points += 9;
    else if (m.vs30 > -0.05) points += 6;
    else if (m.vs30 > -0.15) points += 2;
    if ((m.vs7 ?? 0) > 0) points += 3;
    const tone = m.vs30 > 0.05 ? "positive" : m.vs30 < -0.05 ? "negative" : "neutral";
    reasons.push({ tone, text: `Tendance ${fmtPct(m.vs30)} par rapport à la moyenne des ventes sur 30 jours.` });
  }

  // Liquidité / niveau de prix : sous 5 €, les frais mangent la plus-value.
  const price = p.price;
  if (price != null) {
    if (price >= 50) points += 15;
    else if (price >= 20) points += 12;
    else if (price >= 5) points += 7;
    else reasons.push({ tone: "negative", text: "Prix inférieur à 5 € : commission et frais d'envoi absorbent l'essentiel d'une plus-value." });
    if (p.low != null && p.low / price < 0.35) {
      points -= 4;
      reasons.push({ tone: "neutral", text: "Fort écart entre le prix plancher et la tendance : états très variés ou marché peu liquide, vérifiez les annonces." });
    }
  }

  if (age == null) points += 4;
  else if (age >= 15) points += 10;
  else if (age >= 8) points += 8;
  else if (age >= 4) points += 6;
  else if (age >= 1.5) points += 5;
  else points += 2;
  if (age != null) {
    if (age < 1.5) reasons.push({ tone: "neutral", text: "Extension récente : l'offre peut encore augmenter (réimpressions), les prix se stabilisent souvent après 6-12 mois." });
    else if (age >= 8) reasons.push({ tone: "positive", text: `Extension sortie il y a ${Math.floor(age)} ans : l'offre est figée et se raréfie.` });
  }

  const score = clamp(Math.round((points / MAX_POINTS) * 100), 0, 100);

  let signal: CardAnalysis["signal"];
  if (price == null) signal = { kind: "unknown", label: "Données insuffisantes" };
  else if (m.vs30 != null && m.vs30 >= 0.08 && (m.vs7 ?? 0) >= 0) signal = { kind: "bullish", label: "Momentum haussier" };
  else if (m.vs30 != null && m.vs30 <= -0.08 && score >= 60) signal = { kind: "opportunity", label: "Décote vs moyenne 30 j" };
  else if (m.vs30 != null && m.vs30 <= -0.08) signal = { kind: "bearish", label: "Tendance baissière" };
  else signal = { kind: "neutral", label: "Stable" };

  return {
    score,
    signal,
    momentum: m,
    rarity,
    popularity,
    reasons,
    breakEven: price != null ? round2(breakEvenPrice(price)) : null,
  };
}

/** Volatilité : écart-type des variations entre deux relevés consécutifs. */
export function volatility(prices: number[]): number | null {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) returns.push(prices[i] / prices[i - 1] - 1);
  }
  if (returns.length < 5) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance);
}

/* ------------------------------------------------------------------ */
/* Portefeuille                                                        */
/* ------------------------------------------------------------------ */

export type HoldingKind = "card" | "sealed";
export type PositionCategory = "single" | "graded" | "sealed";

export interface HoldingInput {
  id: string;
  kind: HoldingKind;
  cardId: string | null;
  name: string;
  setName: string | null;
  variant: VariantKey;
  /** Produit Cardmarket (scellé) coté automatiquement. */
  productId?: number | null;
  /** Langue de l'exemplaire (« FR », « EN »…). */
  language?: string;
  gradingCompany: string | null;
  grade: string | null;
  quantity: number;
  purchasePrice: number;
  purchaseDate: string;
  manualPrice: number | null;
  soldAt: string | null;
  salePrice: number | null;
  saleFees: number | null;
}

export type PriceSource = "market" | "sealed" | "ebay" | "sales" | "estimate" | "manual" | "none";

export const PRICE_SOURCE_LABELS: Record<PriceSource, string> = {
  market: "Cardmarket",
  sealed: "Cardmarket · toutes langues",
  ebay: "eBay.fr · annonces FR",
  sales: "Ventes gradées",
  estimate: "Estimation gradée",
  manual: "Valeur manuelle",
  none: "Sans cote",
};

/** Cote unitaire d'une ligne, calculée par le serveur (marché, scellé, gradé). */
export interface UnitQuote {
  price: number | null;
  source: Exclude<PriceSource, "manual" | "none">;
  /** Prix brut de la carte, pour la dynamique (une carte gradée suit sa version brute). */
  momentumFrom?: PriceInfo | null;
}

export interface Valuation {
  unitPrice: number | null;
  priceSource: PriceSource;
  value: number;
  cost: number;
  pnl: number | null;
  pnlPct: number | null;
  vs30: number | null;
  category: PositionCategory;
}

export const CATEGORY_LABELS: Record<PositionCategory, string> = {
  single: "Cartes",
  graded: "Gradées",
  sealed: "Scellé",
};

export function categoryOf(h: Pick<HoldingInput, "kind" | "gradingCompany">): PositionCategory {
  if (h.kind === "sealed") return "sealed";
  return h.gradingCompany ? "graded" : "single";
}

/** Valorise une ligne : la valeur manuelle prime, sinon la cote automatique ; sans prix, on garde le coût. */
export function valueHolding<T extends HoldingInput>(h: T, quote: UnitQuote | null): T & Valuation {
  const cost = h.quantity * h.purchasePrice;
  let unitPrice: number | null = null;
  let priceSource: PriceSource = "none";
  if (h.manualPrice != null) {
    unitPrice = h.manualPrice;
    priceSource = "manual";
  } else if (quote?.price != null) {
    unitPrice = quote.price;
    priceSource = quote.source;
  }
  const value = unitPrice != null ? unitPrice * h.quantity : cost;
  const pnl = unitPrice != null ? value - cost : null;
  return {
    ...h,
    unitPrice,
    priceSource,
    value: round2(value),
    cost: round2(cost),
    pnl: pnl != null ? round2(pnl) : null,
    pnlPct: pnl != null && cost > 0 ? pnl / cost : null,
    vs30: quote?.momentumFrom && priceSource !== "manual" ? momentum(quote.momentumFrom).vs30 : null,
    category: categoryOf(h),
  };
}

export type Position = HoldingInput & Valuation;

export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  unrealized: number;
  unrealizedPct: number | null;
  realized: number;
  realizedPct: number | null;
  itemCount: number;
  positionCount: number;
  topWeight: number;
  topName: string | null;
  hhi: number;
  /** 0 = tout sur une position, 100 = très diversifié. */
  diversification: number;
  allocation: {
    category: { key: PositionCategory; name: string; value: number }[];
    sets: { name: string; value: number }[];
  };
  best: Position | null;
  worst: Position | null;
  weightedVs30: number | null;
  unpriced: number;
}

export function realizedPnl(h: HoldingInput): number {
  return (h.salePrice ?? 0) * h.quantity - (h.saleFees ?? 0) - h.purchasePrice * h.quantity;
}

export function summarizePortfolio(positions: Position[], sold: HoldingInput[] = []): PortfolioSummary {
  const totalValue = positions.reduce((a, p) => a + p.value, 0);
  const totalCost = positions.reduce((a, p) => a + p.cost, 0);
  const unrealized = totalValue - totalCost;

  const realized = sold.reduce((a, h) => a + realizedPnl(h), 0);
  const realizedCost = sold.reduce((a, h) => a + h.purchasePrice * h.quantity, 0);

  // Concentration : plusieurs lots d'une même carte comptent comme une seule exposition.
  const exposure = new Map<string, { name: string; value: number }>();
  for (const p of positions) {
    const key = p.cardId ?? p.id;
    const e = exposure.get(key) ?? { name: p.name, value: 0 };
    e.value += p.value;
    exposure.set(key, e);
  }
  let hhi = 0;
  let topWeight = 0;
  let topName: string | null = null;
  if (totalValue > 0) {
    for (const e of exposure.values()) {
      const w = e.value / totalValue;
      hhi += w * w;
      if (w > topWeight) {
        topWeight = w;
        topName = e.name;
      }
    }
  }

  const byCategory = new Map<PositionCategory, number>();
  const bySet = new Map<string, number>();
  for (const p of positions) {
    byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + p.value);
    const set = p.setName || "Sans extension";
    bySet.set(set, (bySet.get(set) ?? 0) + p.value);
  }
  const sets = [...bySet.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const topSets = sets.slice(0, 6);
  const rest = sets.slice(6).reduce((a, s) => a + s.value, 0);
  if (rest > 0) topSets.push({ name: "Autres", value: rest });

  const priced = positions.filter((p) => p.pnlPct != null);
  const best = priced.reduce<Position | null>((b, p) => (b == null || p.pnlPct! > b.pnlPct! ? p : b), null);
  const worst = priced.reduce<Position | null>((w, p) => (w == null || p.pnlPct! < w.pnlPct! ? p : w), null);

  const withMomentum = positions.filter((p) => p.vs30 != null);
  const momentumWeight = withMomentum.reduce((a, p) => a + p.value, 0);
  const weightedVs30 =
    momentumWeight > 0 ? withMomentum.reduce((a, p) => a + p.value * p.vs30!, 0) / momentumWeight : null;

  return {
    totalValue: round2(totalValue),
    totalCost: round2(totalCost),
    unrealized: round2(unrealized),
    unrealizedPct: totalCost > 0 ? unrealized / totalCost : null,
    realized: round2(realized),
    realizedPct: realizedCost > 0 ? realized / realizedCost : null,
    itemCount: positions.reduce((a, p) => a + p.quantity, 0),
    positionCount: positions.length,
    topWeight,
    topName,
    hhi,
    diversification: positions.length ? Math.round((1 - hhi) * 100) : 0,
    allocation: {
      category: (["single", "graded", "sealed"] as const)
        .map((key) => ({ key, name: CATEGORY_LABELS[key], value: round2(byCategory.get(key) ?? 0) }))
        .filter((c) => c.value > 0),
      sets: topSets.map((s) => ({ ...s, value: round2(s.value) })),
    },
    best,
    worst,
    weightedVs30,
    unpriced: positions.filter((p) => p.priceSource === "none").length,
  };
}

export interface Insight {
  tone: "success" | "warning" | "info";
  title: string;
  body: string;
}

const listNames = (ps: Position[], max = 3) =>
  ps.slice(0, max).map((p) => `« ${p.name} »`).join(", ") + (ps.length > max ? ` et ${ps.length - max} autre(s)` : "");

/** Diagnostic automatique du portefeuille (règles de gestion du risque courantes chez les collectionneurs-investisseurs). */
export function portfolioInsights(positions: Position[], s: PortfolioSummary): Insight[] {
  if (positions.length === 0) return [];
  const out: Insight[] = [];
  const pctTxt = (n: number) => `${Math.round(n * 100)} %`;

  if (s.topWeight > 0.3 && positions.length > 1) {
    out.push({
      tone: "warning",
      title: "Concentration élevée",
      body: `« ${s.topName} » pèse ${pctTxt(s.topWeight)} de la valeur totale. Une baisse de cette seule carte affecterait fortement le portefeuille : beaucoup d'investisseurs plafonnent une ligne à 15-20 %.`,
    });
  } else if (positions.length >= 6 && s.diversification >= 75) {
    out.push({
      tone: "success",
      title: "Portefeuille bien diversifié",
      body: `Score de diversification de ${s.diversification}/100 : aucune ligne ne dépasse ${pctTxt(s.topWeight)} de la valeur.`,
    });
  }

  if (s.weightedVs30 != null && Math.abs(s.weightedVs30) > 0.05) {
    const up = s.weightedVs30 > 0;
    out.push({
      tone: up ? "success" : "warning",
      title: up ? "Dynamique positive" : "Dynamique négative",
      body: `Pondérées par leur valeur, vos cartes cotent ${fmtPct(s.weightedVs30)} par rapport à leur moyenne des 30 derniers jours.`,
    });
  }

  const doubled = positions.filter((p) => (p.pnlPct ?? 0) >= 1).sort((a, b) => b.pnlPct! - a.pnlPct!);
  if (doubled.length) {
    out.push({
      tone: "info",
      title: "Prises de bénéfices à envisager",
      body: `${listNames(doubled)} ${doubled.length > 1 ? "ont" : "a"} plus que doublé. Revendre une partie (25 à 50 %) permet de récupérer sa mise tout en restant exposé.`,
    });
  }

  const losers = positions
    .filter((p) => (p.pnlPct ?? 0) <= -0.3 && (p.vs30 ?? 0) < 0)
    .sort((a, b) => a.pnlPct! - b.pnlPct!);
  if (losers.length) {
    out.push({
      tone: "warning",
      title: "Positions en repli",
      body: `${listNames(losers)} : plus de 30 % de moins-value et une tendance encore négative. Vérifiez si votre thèse tient toujours (réimpression, perte d'intérêt…).`,
    });
  }

  const unpriced = positions.filter((p) => p.priceSource === "none");
  if (unpriced.length) {
    out.push({
      tone: "warning",
      title: "Prix manquants",
      body: `${listNames(unpriced)} n'${unpriced.length > 1 ? "ont" : "a"} pas de prix de marché : saisissez une valeur estimée pour fiabiliser le suivi.`,
    });
  }

  const cheap = positions.filter((p) => p.category === "single" && p.unitPrice != null && p.unitPrice < 5);
  if (cheap.length >= 3) {
    out.push({
      tone: "info",
      title: "Petites cartes peu rentables à l'unité",
      body: `${cheap.length} cartes valent moins de 5 € : commission (≈ 5 %) et frais d'envoi absorbent l'essentiel de la marge. Mieux vaut les revendre en lot.`,
    });
  }

  const gradable = positions.filter((p) => p.category === "single" && (p.unitPrice ?? 0) >= 100);
  if (gradable.length) {
    out.push({
      tone: "info",
      title: "Candidates au grading",
      body: `${listNames(gradable)} ${gradable.length > 1 ? "valent" : "vaut"} plus de 100 € brut. En parfait état (centrage, coins, surface), une note PSA 10 peut multiplier la valeur : simulez-le avec le calculateur de grading.`,
    });
  }

  if (positions.length >= 3 && !s.allocation.category.some((c) => c.key === "sealed")) {
    out.push({
      tone: "info",
      title: "Aucun produit scellé",
      body: "Displays et ETB scellés sont historiquement moins volatils que les cartes à l'unité et se valorisent une fois l'extension épuisée. Une poche « scellé » peut stabiliser le portefeuille.",
    });
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Historique de valeur                                                */
/* ------------------------------------------------------------------ */

export interface SnapshotRow {
  itemKey: string;
  day: string;
  price: number | null;
}

export const cardKey = (cardId: string, variant: VariantKey) => `${cardId}::${variant}`;
export const gradedKey = (cardId: string, variant: VariantKey, company: string, grade: string) =>
  `${cardKey(cardId, variant)}::${company} ${grade}`;
export const sealedKey = (productId: number) => `cm:${productId}`;

/**
 * Clé de l'historique de prix d'une ligne : carte + variante (+ note si gradée), produit scellé
 * Cardmarket, ou la ligne elle-même quand sa valeur est saisie à la main.
 */
export function priceKey(
  h: Pick<HoldingInput, "id" | "kind" | "cardId" | "variant" | "manualPrice" | "productId" | "language" | "gradingCompany" | "grade">,
): string {
  if (h.manualPrice != null) return `manual:${h.id}`;
  // Un scellé français a sa propre cote (marché français) : relevés séparés des autres langues.
  if (h.kind === "sealed") return h.productId ? `${sealedKey(h.productId)}${h.language === "FR" ? ":FR" : ""}` : `manual:${h.id}`;
  if (!h.cardId) return `manual:${h.id}`;
  return h.gradingCompany && h.grade ? gradedKey(h.cardId, h.variant, h.gradingCompany, h.grade) : cardKey(h.cardId, h.variant);
}

export interface HistoryPoint {
  day: string;
  value: number;
  cost: number;
}

/**
 * Valeur quotidienne du portefeuille : chaque ligne détenue ce jour-là est valorisée au dernier
 * relevé connu (avant le premier relevé : valeur manuelle ou prix d'achat).
 */
export function buildPortfolioHistory(
  holdings: HoldingInput[],
  snapshots: SnapshotRow[],
  today: string,
  maxDays = 365,
): HistoryPoint[] {
  if (!holdings.length || !snapshots.length) return [];

  const byKey = new Map<string, SnapshotRow[]>();
  for (const s of snapshots) {
    const list = byKey.get(s.itemKey) ?? [];
    list.push(s);
    byKey.set(s.itemKey, list);
  }
  for (const list of byKey.values()) list.sort((a, b) => a.day.localeCompare(b.day));

  const keys = new Map(holdings.map((h) => [h.id, priceKey(h)]));
  const relevant = [...new Set(keys.values())].filter((k) => byKey.has(k));
  if (!relevant.length) return [];

  let start = relevant.map((k) => byKey.get(k)![0].day).sort()[0];
  const earliest = addDays(today, -maxDays);
  if (start < earliest) start = earliest;
  if (start > today) return [];

  const cursor = new Map<string, number>();
  const current = new Map<string, SnapshotRow>();
  const points: HistoryPoint[] = [];

  for (let day = start; day <= today; day = addDays(day, 1)) {
    for (const k of relevant) {
      const list = byKey.get(k)!;
      let i = cursor.get(k) ?? 0;
      while (i < list.length && list[i].day <= day) {
        current.set(k, list[i]);
        i++;
      }
      cursor.set(k, i);
    }

    let value = 0;
    let cost = 0;
    let held = 0;
    for (const h of holdings) {
      if (h.purchaseDate > day || (h.soldAt && h.soldAt <= day)) continue;
      held++;
      cost += h.quantity * h.purchasePrice;
      const snap = current.get(keys.get(h.id)!);
      const unit = snap?.price ?? null;
      value += h.quantity * (unit ?? h.manualPrice ?? h.purchasePrice);
    }
    if (held) points.push({ day, value: round2(value), cost: round2(cost) });
  }
  return points;
}

/* ------------------------------------------------------------------ */
/* Simulateurs                                                         */
/* ------------------------------------------------------------------ */

export interface GradingInput {
  rawPrice: number;
  gradingCost: number;
  shippingCost: number;
  /** Probabilités (0-1) d'obtenir 10, 9, ou 8 et moins. */
  p10: number;
  p9: number;
  p8: number;
  price10: number;
  price9: number;
  price8: number;
  feeRate: number;
}

export function gradingSimulation(i: GradingInput) {
  const total = i.p10 + i.p9 + i.p8 || 1;
  const expected = (i.p10 * i.price10 + i.p9 * i.price9 + i.p8 * i.price8) / total;
  const gradingSpend = i.gradingCost + i.shippingCost;
  const netGraded = expected * (1 - i.feeRate) - gradingSpend;
  const netRaw = i.rawPrice * (1 - i.feeRate);
  const gain = netGraded - netRaw;
  return {
    expected: round2(expected),
    netGraded: round2(netGraded),
    netRaw: round2(netRaw),
    gain: round2(gain),
    roi: gradingSpend > 0 ? gain / gradingSpend : null,
    /** Prix PSA 10 nécessaire pour que le grading soit neutre, à probabilités égales. */
    breakEven10:
      i.p10 > 0
        ? round2(((netRaw + gradingSpend) / (1 - i.feeRate) * total - i.p9 * i.price9 - i.p8 * i.price8) / i.p10)
        : null,
  };
}

export function projectGrowth(i: { initial: number; monthly: number; annualRate: number; years: number }) {
  const monthlyRate = (1 + i.annualRate) ** (1 / 12) - 1;
  const points: { year: number; invested: number; value: number }[] = [{ year: 0, invested: i.initial, value: i.initial }];
  let value = i.initial;
  let invested = i.initial;
  for (let month = 1; month <= i.years * 12; month++) {
    value = value * (1 + monthlyRate) + i.monthly;
    invested += i.monthly;
    if (month % 12 === 0) points.push({ year: month / 12, invested: round2(invested), value: round2(value) });
  }
  return points;
}
