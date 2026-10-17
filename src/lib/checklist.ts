import { cacheLife, cacheTag } from "next/cache";
import { getExpansionLabelForCard } from "./cardmarket";
import type { ChecklistCard } from "./collection";
import { cardVariants, primaryVariant } from "./pricing";
import { getSet, getUsdToEur, hydrateCards } from "./tcgdex";
import type { Lang, SetDetail } from "./types";

// Catalogue d'une extension mis en forme pour la checklist : léger, sérialisable, trié par numéro.

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

export async function getSetChecklist(id: string, lang: Lang): Promise<SetChecklist | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(`checklist:${lang}:${id}`);
  const set = await getSet(id, lang);
  if (!set) return null;

  const [details, fx] = await Promise.all([hydrateCards(set.cards.map((c) => c.id), lang), getUsdToEur()]);
  const byId = new Map(details.map((d) => [d.id, d]));
  let cardmarketId: number | null = null;
  const cards = set.cards.map((brief): ChecklistEntry => {
    const card = byId.get(brief.id);
    // Fiche indisponible (TCGdex en erreur) : la carte reste cochable, sans variantes ni cote.
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
  return { set: { id: set.id, name, logo, symbol, cardCount, releaseDate, serie }, englishName, cards };
}
