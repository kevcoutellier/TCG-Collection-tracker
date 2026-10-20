import { mapLimit } from "./async";
import { getExpansionLabelForCard } from "./cardmarket";
import type { ChecklistCard } from "./collection";
import { cardVariants, primaryVariant } from "./pricing";
import { getCard, getSet, getUsdToEur } from "./tcgdex";
import type { CardDetail, Lang, SetDetail } from "./types";

// Catalogue d'une extension mis en forme pour la checklist : léger, sérialisable, trié par numéro.
// Ces fonctions interrogent TCGdex en direct ; les pages passent par lib/catalog.ts, qui garde une copie en base.

export interface ChecklistVariant {
  key: string;
  type: string;
  label: string;
  price: number | null;
}

export interface ChecklistEntry extends ChecklistCard {
  name: string;
  image: string | null;
  rarity: string | null;
  variants: ChecklistVariant[];
}

export interface SetChecklist {
  set: Omit<SetDetail, "cards">;
  /** Nom anglais d'une extension japonaise, retrouvé via Cardmarket. */
  englishName: string | null;
  cards: ChecklistEntry[];
}

/**
 * Extension et cartes lues sur TCGdex. `failedCards` : fiches que TCGdex n'a pas pu renvoyer (erreur passagère,
 * pas un 404) ; ces cartes restent cochables, sans variantes ni cote, et la copie en base ne doit pas les figer.
 * `concurrency` : fiches demandées en même temps (moins pour le cron, qui n'est pas pressé).
 */
export async function fetchSetChecklist(
  id: string,
  lang: Lang,
  concurrency = 16,
): Promise<{ checklist: SetChecklist; failedCards: number } | null> {
  const set = await getSet(id, lang);
  if (!set) return null;

  // `undefined` : TCGdex en erreur ; `null` : fiche absente de TCGdex (404).
  const [details, fx] = await Promise.all([
    mapLimit(set.cards, concurrency, (c): Promise<CardDetail | null | undefined> => getCard(c.id, lang).catch(() => undefined)),
    getUsdToEur(),
  ]);
  let cardmarketId: number | null = null;
  const cards = set.cards.map((brief, i): ChecklistEntry => {
    const card = details[i];
    // Fiche indisponible : la carte reste cochable, sans variantes ni cote.
    if (!card) return { id: brief.id, localId: brief.localId, name: brief.name, image: brief.image ?? null, rarity: null, variants: [], price: null };
    const variants = cardVariants(card, fx);
    cardmarketId ??= variants.find((v) => v.cardmarketId)?.cardmarketId ?? null;
    return {
      id: card.id,
      localId: card.localId,
      name: card.name,
      image: card.image ?? null,
      rarity: card.rarity ?? null,
      variants: variants.map((v) => ({ key: v.key, type: v.type, label: v.label, price: v.price.price })),
      price: variants.length ? primaryVariant(variants).price.price : null,
    };
  });
  cards.sort((a, b) => a.localId.localeCompare(b.localId, "fr", { numeric: true }));

  const englishName = lang === "ja" ? await getExpansionLabelForCard(cardmarketId) : null;
  const { name, logo, symbol, cardCount, releaseDate, serie } = set;
  return {
    checklist: { set: { id: set.id, name, logo, symbol, cardCount, releaseDate, serie }, englishName, cards },
    failedCards: details.filter((d) => d === undefined).length,
  };
}

export interface SetInfo {
  id: string;
  name: string;
  logo: string | null;
  symbol: string | null;
  official: number;
  total: number;
  /** Catalogue où l'extension a été trouvée : international (« fr ») ou japonais. */
  lang: "fr" | "ja";
}

/** Fiche courte d'une extension lue sur TCGdex : catalogue international d'abord, japonais sinon. */
export async function fetchSetInfo(id: string): Promise<SetInfo | null> {
  for (const lang of ["fr", "ja"] as const) {
    const set = await getSet(id, lang).catch(() => null);
    if (!set) continue;
    const { official, total } = set.cardCount;
    return { id: set.id, name: set.name, logo: set.logo ?? null, symbol: set.symbol ?? null, official: official || total, total, lang };
  }
  return null;
}
