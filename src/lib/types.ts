// Types partagés : données TCGdex (https://tcgdex.dev) et modèle de prix de l'app.

export type Lang = "fr" | "en" | "ja";

export const LANGS: readonly Lang[] = ["fr", "en", "ja"];

export function parseLang(v: unknown): Lang {
  return v === "en" || v === "ja" ? v : "fr";
}

export interface CardBrief {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

/** Guide des prix Cardmarket (EUR). Les champs « -holo » concernent la version reverse. */
export interface CardmarketPricing {
  updated?: string;
  unit?: string;
  idProduct?: number;
  avg?: number | null;
  low?: number | null;
  trend?: number | null;
  avg1?: number | null;
  avg7?: number | null;
  avg30?: number | null;
  "avg-holo"?: number | null;
  "low-holo"?: number | null;
  "trend-holo"?: number | null;
  "avg1-holo"?: number | null;
  "avg7-holo"?: number | null;
  "avg30-holo"?: number | null;
}

export interface TcgplayerPrice {
  productId?: number;
  lowPrice?: number | null;
  midPrice?: number | null;
  highPrice?: number | null;
  marketPrice?: number | null;
  directLowPrice?: number | null;
}

/** Prix TCGplayer (USD), une entrée par finition : normal, holofoil, reverse-holofoil… */
export type TcgplayerPricing = {
  unit?: string;
  updated?: string;
} & { [variant: string]: TcgplayerPrice | string | undefined };

export interface CardPricing {
  cardmarket?: CardmarketPricing | null;
  tcgplayer?: TcgplayerPricing | null;
}

/** Variante physique d'une carte (1re édition, reverse Poké Ball, tampon…), avec ses propres prix. */
export interface VariantDetail {
  type: string;
  subtype?: string | null;
  size?: string | null;
  stamp?: string[] | null;
  foil?: string | null;
  variantId?: string;
  thirdParty?: { cardmarket?: number | null; tcgplayer?: number | null };
  pricing?: CardPricing | null;
}

export interface CardDetail {
  id: string;
  localId: string;
  name: string;
  image?: string;
  category?: string;
  illustrator?: string;
  rarity?: string;
  hp?: number;
  types?: string[];
  stage?: string;
  dexId?: number[];
  set: {
    id: string;
    name: string;
    logo?: string;
    symbol?: string;
    cardCount?: { official?: number; total?: number };
  };
  variants?: {
    normal?: boolean;
    reverse?: boolean;
    holo?: boolean;
    firstEdition?: boolean;
  };
  variants_detailed?: VariantDetail[] | null;
  pricing?: CardPricing | null;
}

export interface SetSummary {
  id: string;
  name: string;
  logo?: string;
  symbol?: string;
  cardCount: { total: number; official: number };
}

export interface SetDetail extends SetSummary {
  releaseDate?: string;
  serie: { id: string; name: string };
  cards: CardBrief[];
}

export interface SerieDetail {
  id: string;
  name: string;
  logo?: string;
  releaseDate?: string;
  sets: SetSummary[];
}

/** Identifiant de variante : `variantId` TCGdex, ou « normal » / « reverse » (anciennes données). */
export type VariantKey = string;

export interface PriceInfo {
  /** Meilleure estimation en EUR (tendance Cardmarket, sinon moyennes, sinon TCGplayer converti). */
  price: number | null;
  source: "cardmarket" | "tcgplayer" | null;
  trend: number | null;
  avg: number | null;
  low: number | null;
  avg1: number | null;
  avg7: number | null;
  avg30: number | null;
  /** Prix « market » TCGplayer en USD. */
  usdMarket: number | null;
  updated: string | null;
}

export interface CardVariant {
  key: VariantKey;
  label: string;
  type: string;
  price: PriceInfo;
  /** Identifiants produits, pour relier la variante aux autres sources (ventes gradées…). */
  tcgplayerId: number | null;
  cardmarketId: number | null;
}
