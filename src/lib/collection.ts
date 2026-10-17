import type { Lang, VariantKey } from "./types";

// Collection « checklist » : une ligne par carte, langue et variante possédées, sans prix d'achat obligatoire.
// Ce module est pur (aucun accès réseau ni base) : il sert au serveur comme aux composants client.

export interface CollectionItem {
  cardId: string;
  /** Langue de l'exemplaire : « fr » et « en » partagent les ID de cartes TCGdex, « ja » a les siens. */
  lang: Lang;
  /** Extension de la carte (« sv03.5 ») : la complétion se calcule sans relire le catalogue. */
  setId: string;
  variant: VariantKey;
  quantity: number;
}

/** Les ID TCGdex s'écrivent « <extension>-<numéro> » (« sv03.5-006 »). */
export function setIdFromCardId(cardId: string): string {
  const i = cardId.lastIndexOf("-");
  return i > 0 ? cardId.slice(0, i) : cardId;
}

/** Numéro de la carte dans son extension (« 006 »), d'après son ID TCGdex. */
export function localIdFromCardId(cardId: string): string {
  const i = cardId.lastIndexOf("-");
  return i > 0 ? cardId.slice(i + 1) : cardId;
}

/** Carte d'une extension, réduite à ce que demande le calcul de complétion. */
export interface ChecklistCard {
  id: string;
  localId: string;
  variants: { key: VariantKey; type: string; price: number | null }[];
  /** Cote de la variante de référence. */
  price: number | null;
}

export interface SetProgress {
  /** Cartes officielles possédées (au moins une variante), sur `official`. */
  owned: number;
  official: number;
  /** Toutes les cartes, secrètes comprises. */
  ownedAll: number;
  total: number;
  /** Couples carte × variante possédés, sur `masterTotal` : le « master set ». */
  masterOwned: number;
  masterTotal: number;
  /** Cartes officielles manquantes. */
  missing: number;
  /** Somme des cotes des cartes officielles manquantes ; `null` si aucune n'est cotée. */
  missingCost: number | null;
}

/**
 * Les secrètes sont numérotées au-delà du nombre officiel (« 166/165 »). Les numéros non numériques
 * (« TG01 », « GG12 ») sont des sous-séries hors set, sauf dans les extensions sans secrètes (promos).
 */
export function isOfficial(card: Pick<ChecklistCard, "localId">, official: number, total: number): boolean {
  const n = Number.parseInt(card.localId, 10);
  if (Number.isNaN(n)) return official >= total;
  return n <= official;
}

/** Cartes officielles parmi les cartes possédées d'une extension : la liste des extensions s'en sert sans charger le catalogue. */
export function countOfficial(cardIds: readonly string[], official: number, total: number): number {
  return cardIds.filter((id) => isOfficial({ localId: localIdFromCardId(id) }, official, total)).length;
}

/** Variante du catalogue correspondant à une clé enregistrée (accepte les anciennes clés « normal » / « reverse »). */
export function resolveVariantKey(card: Pick<ChecklistCard, "variants">, key: VariantKey): VariantKey | null {
  if (!card.variants.length || card.variants.some((v) => v.key === key)) return key;
  if (key === "normal") return card.variants.find((v) => v.type !== "reverse")?.key ?? null;
  if (key === "reverse") return card.variants.find((v) => v.type === "reverse")?.key ?? null;
  return null;
}

/** Quantité possédée de chaque variante d'une carte, toutes langues confondues. */
export function ownedByVariant(card: Pick<ChecklistCard, "variants">, items: readonly CollectionItem[]): Map<VariantKey, number> {
  const out = new Map<VariantKey, number>();
  for (const item of items) {
    if (item.quantity <= 0) continue;
    const key = resolveVariantKey(card, item.variant);
    if (key != null) out.set(key, (out.get(key) ?? 0) + item.quantity);
  }
  return out;
}

export function groupByCard<T extends Pick<CollectionItem, "cardId">>(items: readonly T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const list = out.get(item.cardId);
    if (list) list.push(item);
    else out.set(item.cardId, [item]);
  }
  return out;
}

/** Avancement d'une extension à partir de ses cartes et des lignes de collection (les autres sont ignorées). */
export function setProgress(cards: readonly ChecklistCard[], items: readonly CollectionItem[], official: number): SetProgress {
  const byCard = groupByCard(items);
  let owned = 0;
  let ownedAll = 0;
  let masterOwned = 0;
  let masterTotal = 0;
  let missingCost = 0;
  let priced = false;
  for (const card of cards) {
    const qty = ownedByVariant(card, byCard.get(card.id) ?? []);
    masterTotal += Math.max(1, card.variants.length);
    masterOwned += qty.size;
    if (qty.size) ownedAll += 1;
    if (!isOfficial(card, official, cards.length)) continue;
    if (qty.size) owned += 1;
    else if (card.price != null) {
      missingCost += card.price;
      priced = true;
    }
  }
  return {
    owned,
    official,
    ownedAll,
    total: cards.length,
    masterOwned,
    masterTotal,
    missing: Math.max(0, official - owned),
    missingCost: priced ? Math.round(missingCost * 100) / 100 : null,
  };
}

export interface CollectionTotals {
  /** Nombre d'exemplaires. */
  copies: number;
  /** Cartes différentes, toutes variantes confondues. */
  unique: number;
  /** Exemplaires en trop (au-delà du premier de chaque carte × variante × langue) : la monnaie d'échange. */
  doubles: number;
  /** Extensions dont au moins une carte est possédée. */
  sets: number;
}

export function collectionTotals(items: readonly CollectionItem[]): CollectionTotals {
  const cards = new Set<string>();
  const sets = new Set<string>();
  let copies = 0;
  let doubles = 0;
  for (const item of items) {
    if (item.quantity <= 0) continue;
    copies += item.quantity;
    doubles += item.quantity - 1;
    cards.add(item.cardId);
    sets.add(item.setId);
  }
  return { copies, unique: cards.size, doubles, sets: sets.size };
}

/** Carte qu'un collectionneur peut céder : un de ses doubles, avec le nombre d'exemplaires en trop. */
export interface TradeCard {
  cardId: string;
  setId: string;
  lang: Lang;
  variant: VariantKey;
  spare: number;
}

/**
 * Doubles de `giver` qui manquent à `taker`, limités aux extensions que `taker` a commencées (un double
 * d'une extension qu'il ne collectionne pas ne l'intéresse pas). Une entrée par carte : la variante la plus
 * abondante, triées par extension puis numéro.
 */
export function tradeMatches(giver: readonly CollectionItem[], taker: readonly CollectionItem[]): TradeCard[] {
  const owned = new Set<string>();
  const started = new Set<string>();
  for (const item of taker) {
    if (item.quantity <= 0) continue;
    owned.add(item.cardId);
    started.add(item.setId);
  }
  const best = new Map<string, TradeCard>();
  for (const item of giver) {
    const spare = item.quantity - 1;
    if (spare <= 0 || owned.has(item.cardId) || !started.has(item.setId)) continue;
    const current = best.get(item.cardId);
    if (!current || spare > current.spare) {
      best.set(item.cardId, { cardId: item.cardId, setId: item.setId, lang: item.lang, variant: item.variant, spare });
    }
  }
  return [...best.values()].sort((a, b) => a.cardId.localeCompare(b.cardId, "fr", { numeric: true }));
}
