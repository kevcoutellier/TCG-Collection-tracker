import type {
  CardDetail,
  CardmarketPricing,
  CardPricing,
  CardVariant,
  PriceInfo,
  TcgplayerPrice,
  TcgplayerPricing,
  VariantDetail,
  VariantKey,
} from "./types";

/** TCGdex renvoie 0 ou null quand il n'y a pas de vente : on traite les deux comme « inconnu ». */
function positive(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

type CmField = "avg" | "low" | "trend" | "avg1" | "avg7" | "avg30";

function cardmarketField(cm: CardmarketPricing | null | undefined, field: CmField, holo: boolean): number | null {
  if (!cm) return null;
  return positive(cm[(holo ? `${field}-holo` : field) as keyof CardmarketPricing]);
}

function tcgplayerEntry(tp: TcgplayerPricing | null | undefined, keys: string[], anyFallback: boolean): TcgplayerPrice | null {
  if (!tp) return null;
  for (const key of keys) {
    const v = tp[key];
    if (v && typeof v === "object") return v;
  }
  if (!anyFallback) return null;
  for (const [key, v] of Object.entries(tp)) {
    if (key !== "reverse-holofoil" && v && typeof v === "object") return v;
  }
  return null;
}

export const EMPTY_PRICE: PriceInfo = {
  price: null,
  source: null,
  trend: null,
  avg: null,
  low: null,
  avg1: null,
  avg7: null,
  avg30: null,
  usdMarket: null,
  updated: null,
};

/**
 * Prix d'une finition à partir d'un bloc de prix TCGdex.
 * `holo` : lire les champs « -holo » de Cardmarket (version reverse d'un même produit).
 */
export function priceFromPricing(
  pricing: CardPricing | null | undefined,
  opts: { holo: boolean; tcgKeys: string[]; tcgAnyFallback?: boolean },
  usdToEur: number,
): PriceInfo {
  const cm = pricing?.cardmarket;
  const tv = tcgplayerEntry(pricing?.tcgplayer, opts.tcgKeys, opts.tcgAnyFallback ?? false);
  const trend = cardmarketField(cm, "trend", opts.holo);
  const avg = cardmarketField(cm, "avg", opts.holo);
  const low = cardmarketField(cm, "low", opts.holo);
  const avg1 = cardmarketField(cm, "avg1", opts.holo);
  const avg7 = cardmarketField(cm, "avg7", opts.holo);
  const avg30 = cardmarketField(cm, "avg30", opts.holo);
  const usdMarket = positive(tv?.marketPrice) ?? positive(tv?.midPrice);

  let price = trend ?? avg7 ?? avg30 ?? avg ?? low;
  let source: PriceInfo["source"] = price != null ? "cardmarket" : null;
  if (price == null && usdMarket != null) {
    price = round2(usdMarket * usdToEur);
    source = "tcgplayer";
  }
  return {
    price,
    source,
    trend,
    avg,
    low,
    avg1,
    avg7,
    avg30,
    usdMarket,
    updated: cm?.updated ?? (pricing?.tcgplayer?.updated as string | undefined) ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Libellés                                                            */
/* ------------------------------------------------------------------ */

// TCGdex localise ces champs selon la langue (« unlimited » en anglais, « illimité » en français) :
// on compare des formes normalisées et on affiche toujours des libellés français.
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-");
}

const TYPE_LABELS: Record<string, string> = { normal: "Normale", holo: "Holo", reverse: "Reverse" };
const SUBTYPE_LABELS: Record<string, string> = {
  unlimited: "Illimitée",
  illimite: "Illimitée",
  shadowless: "Shadowless",
  "sans-ombre": "Shadowless",
  "1999-2000-copyright": "© 1999-2000",
  "copyright-1999-2000": "© 1999-2000",
};
const STAMP_LABELS: Record<string, string> = {
  "1st-edition": "1re édition",
  "1re-edition": "1re édition",
  "set-logo": "Tampon logo",
  "logo-de-la-serie": "Tampon logo",
  "pokemon-center": "Pokémon Center",
  staff: "Staff",
  prerelease: "Avant-première",
  "w-promo": "Promo W",
};
const FOIL_LABELS: Record<string, string> = {
  pokeball: "Poké Ball",
  masterball: "Master Ball",
  cosmos: "Cosmos",
  energy: "Énergie",
};

const humanize = (s: string) => s.replace(/[-_]/g, " ").replace(/^\p{L}/u, (c) => c.toUpperCase());
const labelOf = (value: string, map: Record<string, string>) => map[norm(value)] ?? humanize(value);

/** Type normalisé : « normal », « holo » ou « reverse » quelle que soit la langue. */
export const variantType = (v: Pick<VariantDetail, "type">) => norm(v.type);

const isFirstEdition = (v: Pick<VariantDetail, "stamp">) => (v.stamp ?? []).some((s) => /^(1st|1re)-/.test(norm(s)));

export function variantLabel(v: Pick<VariantDetail, "type" | "subtype" | "stamp" | "foil" | "size">): string {
  const parts = [labelOf(v.type, TYPE_LABELS)];
  if (v.subtype) parts.push(labelOf(v.subtype, SUBTYPE_LABELS));
  for (const s of v.stamp ?? []) parts.push(labelOf(s, STAMP_LABELS));
  if (v.foil) parts.push(labelOf(v.foil, FOIL_LABELS));
  if (v.size && norm(v.size) !== "standard") parts.push(humanize(v.size));
  return parts.join(" · ");
}

/* ------------------------------------------------------------------ */
/* Variantes                                                           */
/* ------------------------------------------------------------------ */

function tcgKeysFor(v: VariantDetail): string[] {
  const type = variantType(v);
  if (type === "reverse") return v.foil ? ["holofoil", "reverse-holofoil"] : ["reverse-holofoil"];
  if (isFirstEdition(v)) return ["1st-edition-holofoil", "1st-edition", "holofoil"];
  if (type === "holo") return ["holofoil", "unlimited-holofoil", "normal"];
  return ["normal", "unlimited", "holofoil"];
}

/** Toutes les variantes d'une carte avec leur prix. */
export function cardVariants(card: Pick<CardDetail, "pricing" | "variants_detailed">, usdToEur: number): CardVariant[] {
  const detailed = card.variants_detailed ?? [];
  if (detailed.length) {
    // Un reverse « simple » partage le produit Cardmarket de la version normale : ses prix sont
    // dans les champs « -holo ». Les reverse spéciaux (Poké Ball…) ont leur propre produit.
    const baseProducts = new Set(detailed.filter((v) => variantType(v) !== "reverse").map((v) => v.thirdParty?.cardmarket ?? null));
    return detailed.map((v, i) => {
      const type = variantType(v);
      // Une variante sans prix propre n'hérite pas de ceux de la carte (sauf la première, qui les porte).
      const pricing = v.pricing ?? (i === 0 ? card.pricing : null);
      const cmId = v.thirdParty?.cardmarket ?? pricing?.cardmarket?.idProduct ?? null;
      const sharesBase = baseProducts.has(cmId) || baseProducts.size === 0 || cmId == null;
      const holo = type === "reverse" && !v.foil && !v.stamp?.length && sharesBase;
      const tcgKeys = tcgKeysFor(v);
      const price = priceFromPricing(pricing, { holo, tcgKeys, tcgAnyFallback: type !== "reverse" }, usdToEur);
      const tcgEntry = tcgplayerEntry(pricing?.tcgplayer, tcgKeys, type !== "reverse");
      return {
        key: v.variantId ?? `${type}-${i}`,
        label: variantLabel(v),
        type,
        price,
        tcgplayerId: v.thirdParty?.tcgplayer ?? tcgEntry?.productId ?? null,
        cardmarketId: cmId,
      };
    });
  }

  // Anciennes fiches sans détail des variantes : standard + reverse si une cote existe.
  const normal = priceFromPricing(card.pricing, { holo: false, tcgKeys: ["holofoil", "normal", "1st-edition-holofoil"], tcgAnyFallback: true }, usdToEur);
  const reverse = priceFromPricing(card.pricing, { holo: true, tcgKeys: ["reverse-holofoil"] }, usdToEur);
  const cmId = card.pricing?.cardmarket?.idProduct ?? null;
  const tcgId = tcgplayerEntry(card.pricing?.tcgplayer, ["holofoil", "normal"], true)?.productId ?? null;
  const out: CardVariant[] = [{ key: "normal", label: "Normale", type: "normal", price: normal, tcgplayerId: tcgId, cardmarketId: cmId }];
  if (reverse.price != null) out.push({ key: "reverse", label: "Reverse", type: "reverse", price: reverse, tcgplayerId: tcgId, cardmarketId: cmId });
  return out;
}

/** Variante de référence : la première qui a une cote (sinon la première tout court). */
export function primaryVariant(variants: CardVariant[]): CardVariant {
  return variants.find((v) => v.price.price != null) ?? variants[0];
}

/** Retrouve une variante par sa clé, en acceptant les anciennes clés « normal » / « reverse ». */
export function findVariant(variants: CardVariant[], key: VariantKey | null | undefined): CardVariant {
  if (!variants.length) {
    return { key: key ?? "normal", label: "Normale", type: "normal", price: EMPTY_PRICE, tcgplayerId: null, cardmarketId: null };
  }
  const exact = variants.find((v) => v.key === key);
  if (exact) return exact;
  if (key === "reverse") return variants.find((v) => v.type === "reverse" && !v.label.includes("·")) ?? variants.find((v) => v.type === "reverse") ?? primaryVariant(variants);
  if (key === "normal") return variants.find((v) => v.type !== "reverse") ?? primaryVariant(variants);
  return primaryVariant(variants);
}

export function extractPrice(card: Pick<CardDetail, "pricing" | "variants_detailed">, key: VariantKey, usdToEur: number): PriceInfo {
  return findVariant(cardVariants(card, usdToEur), key).price;
}

/** Prix « vitrine » d'une carte (variante de référence). */
export function mainPrice(card: Pick<CardDetail, "pricing" | "variants_detailed">, usdToEur: number): PriceInfo {
  return primaryVariant(cardVariants(card, usdToEur)).price;
}
