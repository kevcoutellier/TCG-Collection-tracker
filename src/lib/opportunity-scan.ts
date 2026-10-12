import { cacheLife } from "next/cache";
import { baseCardName, getExpansionLabels, getSinglesWithPrices, normalizeSetName, type SingleProduct } from "./cardmarket";
import { type Opportunity, type ScanFilters, scanOpportunities } from "./opportunities";
import { getCard, getSet, getSetList, hydrateCards } from "./tcgdex";
import type { CardDetail, Lang } from "./types";

// Scanner du marché : toutes les cartes du guide des prix Cardmarket, classées par opportunité,
// puis rapprochées de leur fiche TCGdex (visuel, nom français, lien) pour celles affichées.

export interface OpportunityItem extends SingleProduct {
  /** Extension Cardmarket (nom anglais), quand elle est connue. */
  expansion: string | null;
  opportunity: Opportunity;
}

export async function loadMarketOpportunities(filters: ScanFilters) {
  const [{ singles, updated }, labels] = await Promise.all([
    getSinglesWithPrices(),
    getExpansionLabels().catch(() => new Map<number, string>()),
  ]);
  const items: OpportunityItem[] = scanOpportunities(singles, filters).map((s) => ({
    ...s,
    expansion: labels.get(s.idExpansion) ?? null,
  }));
  return { items, scanned: singles.length, updated };
}

export interface ResolvedCard {
  id: string;
  lang: Lang;
  name: string;
  image: string | null;
  localId: string;
  /** Nombre de cartes imprimé (« 199/165 » → 165). */
  total: number | null;
}

const normalizeName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

function cardmarketIds(card: CardDetail): number[] {
  const ids = (card.variants_detailed ?? []).map((v) => v.thirdParty?.cardmarket);
  ids.push(card.pricing?.cardmarket?.idProduct);
  return ids.filter((x): x is number => typeof x === "number");
}

async function resolveCached(idProduct: number, name: string, expansion: string): Promise<ResolvedCard | null> {
  "use cache";
  cacheLife("days");
  const target = normalizeSetName(expansion);
  const set = (await getSetList("en")).find((s) => normalizeSetName(s.name) === target);
  if (!set) return null;
  const detail = await getSet(set.id, "en");
  const wanted = normalizeName(baseCardName(name));
  const candidates = (detail?.cards ?? []).filter((c) => normalizeName(c.name) === wanted).slice(0, 8);
  if (!candidates.length) return null;
  const cards = await hydrateCards(
    candidates.map((c) => c.id),
    "en",
  );
  // Plusieurs cartes du même nom dans l'extension (illustration alternative…) : l'identifiant
  // Cardmarket tranche ; une seule candidate suffit sinon.
  const card = cards.find((c) => cardmarketIds(c).includes(idProduct)) ?? (cards.length === 1 ? cards[0] : null);
  if (!card) return null;
  const fr = await getCard(card.id, "fr").catch(() => null);
  const shown = fr ?? card;
  return {
    id: card.id,
    lang: fr ? "fr" : "en",
    name: shown.name,
    image: shown.image ?? card.image ?? null,
    localId: card.localId,
    total: card.set.cardCount?.official ?? null,
  };
}

/** Fiche TCGdex d'une carte Cardmarket ; null si introuvable ou si TCGdex ne répond pas. */
export async function resolveCardmarketSingle(item: Pick<OpportunityItem, "idProduct" | "name" | "expansion">): Promise<ResolvedCard | null> {
  if (!item.expansion) return null;
  try {
    return await resolveCached(item.idProduct, item.name, item.expansion);
  } catch {
    return null;
  }
}
