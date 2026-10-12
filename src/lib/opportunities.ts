// Détection d'opportunités d'achat (fonctions pures) à partir des cotes Cardmarket :
// une carte demandée qui s'échange sous sa moyenne récente, idéalement avec des ventes qui repartent.
import { momentum, type PopularityTier, popularityTier } from "./analysis";
import { eur, pctText } from "./format";
import { toEnglishQuery } from "./pokemon-names";
import type { PriceInfo } from "./types";

export type OpportunityKind = "rebound" | "discount" | "floor";

export const OPPORTUNITY_LABELS: Record<OpportunityKind, string> = {
  rebound: "Rebond après une baisse",
  discount: "Sous sa moyenne 30 j",
  floor: "Annonce sous la cote",
};

export interface Opportunity {
  kind: OpportunityKind;
  /** Attractivité 0-100 : ampleur de la décote, reprise des ventes, demande, liquidité. */
  score: number;
  /** Tendance vs moyenne des ventes 30 j (négatif = décote). */
  vs30: number | null;
  /** Tendance vs moyenne 7 j. */
  vs7: number | null;
  /** Moyenne des ventes 24 h vs moyenne 7 j (positif = les ventes repartent). */
  day: number | null;
  /** Annonce la moins chère rapportée à la tendance. */
  floorRatio: number | null;
  /** Écart en euros avec la moyenne 30 j : gain si le prix y revient. */
  upside: number | null;
  popularity: PopularityTier;
  reasons: string[];
}

/** Sous 10 €, commission et frais d'envoi absorbent l'essentiel d'un rebond. */
export const DEFAULT_MIN_PRICE = 10;

const POPULARITY_POINTS: Record<PopularityTier, number> = { S: 20, A: 12, B: 4 };
const MAX_POINTS = 35 + 15 + 20 + 15 + 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function evaluateOpportunity(name: string, p: PriceInfo, minPrice = DEFAULT_MIN_PRICE): Opportunity | null {
  const price = p.price;
  if (price == null || price < minPrice || p.source !== "cardmarket") return null;
  const m = momentum(p);
  const floorRatio = p.low != null ? p.low / price : null;

  let kind: OpportunityKind | null = null;
  if (m.vs30 != null && m.vs30 <= -0.08 && m.day != null && m.day >= 0) kind = "rebound";
  else if (m.vs30 != null && m.vs30 <= -0.1) kind = "discount";
  else if (floorRatio != null && floorRatio <= 0.6 && price >= 20) kind = "floor";
  if (!kind) return null;

  const popularity = popularityTier(name);
  const reasons: string[] = [];
  let points = 0;

  if (m.vs30 != null && m.vs30 < 0) {
    points += (Math.min(-m.vs30, 0.4) / 0.4) * 35;
    reasons.push(`Tendance ${pctText(m.vs30)} sous la moyenne des ventes sur 30 jours (${eur(p.avg30)}).`);
    if (m.vs30 < -0.5) {
      points -= 15;
      reasons.push("Chute de plus de moitié : vérifiez qu'il ne s'agit pas d'une réimpression ou d'une cote aberrante.");
    }
  }
  if (m.day != null) {
    points += m.day >= 0.03 ? 15 : m.day >= 0 ? 10 : m.day >= -0.05 ? 4 : 0;
    if (m.day >= 0) reasons.push("Les ventes des dernières 24 h repartent au-dessus de la moyenne 7 jours.");
  }
  if (m.vs7 != null && m.vs7 < -0.12) {
    points -= 10;
    reasons.push("La baisse s'accélère cette semaine : attendre une stabilisation peut être plus prudent.");
  }
  points += POPULARITY_POINTS[popularity];
  if (popularity === "S") reasons.push("Pokémon parmi les plus recherchés : la demande revient en général.");
  else if (popularity === "A") reasons.push("Pokémon populaire auprès des collectionneurs.");
  points += price >= 100 ? 15 : price >= 30 ? 12 : price >= 15 ? 9 : 6;
  if (floorRatio != null) {
    points += floorRatio <= 0.6 ? 10 : floorRatio <= 0.8 ? 5 : 0;
    if (floorRatio <= 0.6) {
      reasons.push(
        `Annonce la moins chère à ${eur(p.low)} (${Math.round(floorRatio * 100)} % de la cote) : souvent un état abîmé ou une autre langue, à vérifier.`,
      );
    }
  }

  return {
    kind,
    score: Math.max(0, Math.min(100, Math.round((points / MAX_POINTS) * 100))),
    vs30: m.vs30,
    vs7: m.vs7,
    day: m.day,
    floorRatio,
    upside: p.avg30 != null ? round2(p.avg30 - price) : null,
    popularity,
    reasons,
  };
}

export interface ScanFilters {
  kind?: OpportunityKind | null;
  minPrice?: number;
  maxPrice?: number | null;
  /** Uniquement les Pokémon les plus recherchés (tiers S et A). */
  popularOnly?: boolean;
  /** Recherche dans le nom (les noms français connus sont traduits). */
  query?: string;
}

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Évalue et classe un lot de cartes : meilleures opportunités d'abord. */
export function scanOpportunities<T extends { name: string; price: PriceInfo }>(
  items: readonly T[],
  filters: ScanFilters = {},
): (T & { opportunity: Opportunity })[] {
  const minPrice = filters.minPrice ?? DEFAULT_MIN_PRICE;
  const tokens = filters.query ? toEnglishQuery(filters.query).split(" ").filter(Boolean) : [];
  const out: (T & { opportunity: Opportunity })[] = [];
  for (const item of items) {
    if (filters.maxPrice != null && (item.price.price ?? 0) > filters.maxPrice) continue;
    if (tokens.length) {
      const name = normalize(item.name);
      if (!tokens.every((t) => name.includes(t))) continue;
    }
    const opportunity = evaluateOpportunity(item.name, item.price, minPrice);
    if (!opportunity) continue;
    if (filters.kind && opportunity.kind !== filters.kind) continue;
    if (filters.popularOnly && opportunity.popularity === "B") continue;
    out.push({ ...item, opportunity });
  }
  return out.sort((a, b) => b.opportunity.score - a.opportunity.score || (b.opportunity.upside ?? 0) - (a.opportunity.upside ?? 0));
}
