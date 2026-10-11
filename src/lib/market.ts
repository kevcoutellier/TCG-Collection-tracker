import { cacheLife } from "next/cache";
import { momentum } from "./analysis";
import { extractPrice } from "./pricing";
import { getSeriesWithSets, getUsdToEur, hydrateCards } from "./tcgdex";

export type Era = "vintage" | "swsh" | "sv" | "me";

export const ERA_LABELS: Record<Era, string> = {
  vintage: "Vintage (1999-2007)",
  swsh: "Épée et Bouclier",
  sv: "Écarlate et Violet",
  me: "Méga-Évolution",
};

/** Panier de cartes « blue chip » : les références les plus échangées de chaque époque. */
export const BLUE_CHIPS: { id: string; era: Era }[] = [
  { id: "base1-4", era: "vintage" },
  { id: "base1-2", era: "vintage" },
  { id: "base1-15", era: "vintage" },
  { id: "neo4-107", era: "vintage" },
  { id: "ex8-107", era: "vintage" },
  { id: "swsh7-215", era: "swsh" },
  { id: "swsh7-218", era: "swsh" },
  { id: "swsh7-212", era: "swsh" },
  { id: "swsh8-271", era: "swsh" },
  { id: "swsh8-269", era: "swsh" },
  { id: "swsh9-154", era: "swsh" },
  { id: "swsh11-186", era: "swsh" },
  { id: "swsh12-186", era: "swsh" },
  { id: "sv02-203", era: "sv" },
  { id: "sv03-223", era: "sv" },
  { id: "sv03.5-199", era: "sv" },
  { id: "sv03.5-200", era: "sv" },
  { id: "sv04.5-234", era: "sv" },
  { id: "sv06-214", era: "sv" },
  { id: "sv08-238", era: "sv" },
  { id: "sv08.5-161", era: "sv" },
  { id: "sv08.5-156", era: "sv" },
  { id: "sv10-231", era: "sv" },
  { id: "sv10.5b-172", era: "sv" },
  { id: "sv10.5w-173", era: "sv" },
  { id: "me01-188", era: "me" },
  { id: "me02-130", era: "me" },
  { id: "me02.5-295", era: "me" },
  { id: "me04-122", era: "me" },
  { id: "me05-120", era: "me" },
];

export interface MarketCard {
  id: string;
  name: string;
  setName: string;
  image: string | null;
  rarity: string | null;
  era: Era;
  price: number | null;
  avg30: number | null;
  avg7: number | null;
  vs30: number | null;
  vs7: number | null;
}

export interface IndexStats {
  value: number;
  vs30: number | null;
  vs7: number | null;
  up: number;
  total: number;
}

/** Indice pondéré par les prix : somme des tendances vs somme des moyennes 7/30 jours. */
export function computeIndex(cards: MarketCard[]): IndexStats {
  const valid = cards.filter((c) => c.price != null && c.avg30 != null && c.avg7 != null);
  const sum = valid.reduce((a, c) => a + c.price!, 0);
  const sum30 = valid.reduce((a, c) => a + c.avg30!, 0);
  const sum7 = valid.reduce((a, c) => a + c.avg7!, 0);
  return {
    value: Math.round(sum),
    vs30: sum30 > 0 ? sum / sum30 - 1 : null,
    vs7: sum7 > 0 ? sum / sum7 - 1 : null,
    up: valid.filter((c) => (c.vs30 ?? 0) > 0).length,
    total: valid.length,
  };
}

export async function getMarketOverview() {
  "use cache";
  cacheLife("hours");
  const [fx, cards] = await Promise.all([getUsdToEur(), hydrateCards(BLUE_CHIPS.map((b) => b.id), "fr")]);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const list: MarketCard[] = BLUE_CHIPS.flatMap(({ id, era }) => {
    const c = byId.get(id);
    if (!c) return [];
    const p = extractPrice(c, "normal", fx);
    const m = momentum(p);
    return [
      {
        id,
        era,
        name: c.name,
        setName: c.set.name,
        image: c.image ?? null,
        rarity: c.rarity ?? null,
        price: p.price,
        avg30: p.avg30,
        avg7: p.avg7,
        vs30: m.vs30,
        vs7: m.vs7,
      },
    ];
  });
  const updated = cards.map((c) => c.pricing?.cardmarket?.updated).filter(Boolean).sort().at(-1) ?? null;
  const eras = (Object.keys(ERA_LABELS) as Era[]).map((era) => ({
    era,
    label: ERA_LABELS[era],
    ...computeIndex(list.filter((c) => c.era === era)),
  }));
  return { cards: list, index: computeIndex(list), eras, updated };
}

/** Dernières extensions principales (hors promos et mini-sets). */
export async function getRecentSets(limit = 8) {
  "use cache";
  cacheLife("days");
  const series = await getSeriesWithSets("fr");
  return series
    .flatMap((s) => s.sets.map((set) => ({ ...set, serie: s.name })))
    .filter((s) => s.cardCount.official >= 60)
    .slice(0, limit);
}
