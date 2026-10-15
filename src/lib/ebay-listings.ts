// Prix du marché français d'un produit scellé à partir des annonces eBay.fr : recherche en français
// (les annonces sont rédigées en français, pas avec les noms anglais du catalogue Cardmarket) et
// tri des annonces (boîtes vides, lots, autres langues, produits voisins).

export type FrenchSealedKind = "etb" | "display" | "bundle" | "booster" | "upc";

export interface FrenchSealedSearch {
  query: string;
  kind: FrenchSealedKind;
  pokemonCenter: boolean;
}

export interface Listing {
  title: string;
  price: number;
}

export interface MarketSummary {
  /** Médiane des annonces retenues. */
  price: number;
  low: number;
  count: number;
}

/**
 * Types reconnus d'après le nom anglais du produit. `words` : mots-clés eBay, `(a, b)` = a OU b.
 * `exclude` : annonces d'un produit voisin (titre sans accents, en minuscules).
 */
const KINDS: { kind: FrenchSealedKind; match: RegExp; words: string; exclude: RegExp }[] = [
  { kind: "etb", match: /Elite Trainer Box$/i, words: "(etb, elite, élite)", exclude: /\b(display|bundle)\b/ },
  { kind: "display", match: /Booster (?:Box|Display)$/i, words: "display", exclude: /\b(demi|18 boosters|etb|elite|bundle)\b/ },
  { kind: "bundle", match: /Booster Bundle$/i, words: "bundle", exclude: /\b(display|etb|elite)\b/ },
  {
    kind: "booster",
    match: /(?:^|\s)(?:Sleeved )?Booster$/i,
    words: "booster",
    exclude: /\b(display|etb|elite|bundle|coffret|tripack|blister|\d+ boosters)\b/,
  },
  { kind: "upc", match: /Ultra-Premium Collection$/i, words: "(upc, ultra)", exclude: /\b(etb|elite|display)\b/ },
];

/** Lots et caisses : pas d'équivalent fiable sur eBay. */
const MULTI_PACK = /\b(?:Case|Bundle Display)\b|\(\d+ Boosters\)/i;

/** Mots du nom d'extension que les vendeurs omettent souvent (« Écarlate et Violet »). */
const SET_STOPWORDS = new Set(["et", "de", "du", "des", "la", "le", "les", "a", "à", "en"]);

/** Recherche eBay.fr d'un produit du catalogue Cardmarket ; null si le type ou l'extension française sont inconnus. */
export function frenchSealedSearch(name: string, frenchSetName: string | null): FrenchSealedSearch | null {
  if (!frenchSetName || MULTI_PACK.test(name)) return null;
  const pokemonCenter = /Pok[eé]mon Center/i.test(name);
  const base = name.replace(/\s*Pok[eé]mon Center(?: Version)?\s*/i, " ").trim();
  const rule = KINDS.find((k) => k.match.test(base));
  if (!rule) return null;
  const set = frenchSetName
    .split(/[\s:–-]+/)
    .filter((w) => w && !SET_STOPWORDS.has(w.toLowerCase()))
    .join(" ");
  if (!set) return null;
  return { query: `${set} ${rule.words}${pokemonCenter ? " center" : ""}`, kind: rule.kind, pokemonCenter };
}

const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Boîtes vides, cartes seules, abîmés, lots (« Lot de 2 », « ETB x2 », « 2 ETB »). */
const NOT_THE_PRODUCT =
  /\b(vides?|empty|sans boosters?|box only|cartes? promo|promo seule?|abimee?s?|endommagee?s?|damaged|lots?|case|x ?[2-9]|[2-9] (?:etb|displays|coffrets|bundles))\b/;

/** Versions dans une autre langue que le français. */
const OTHER_LANGUAGE =
  /\b(english|anglaise?|eng|vo|japonaise?|japanese|jpn?|jap|coreenne?|korean|kr|chinoise?|chinese|cn|italienne?|ita|allemande?|deutsch|espagnole?|spanish)\b/;

const POKEMON_CENTER = /\b(center|pc)\b/;

const MIN_LISTINGS = 3;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Médiane des annonces qui correspondent bien au produit ; null s'il en reste moins de trois.
 * `reference` (cote Cardmarket) écarte les prix aberrants : accessoires, lots non signalés.
 */
export function summarizeListings(
  listings: Listing[],
  { kind, pokemonCenter, reference }: { kind: FrenchSealedKind; pokemonCenter: boolean; reference: number | null },
): MarketSummary | null {
  const rule = KINDS.find((k) => k.kind === kind)!;
  const prices = listings
    .filter(({ title }) => {
      const t = plain(title);
      return !NOT_THE_PRODUCT.test(t) && !OTHER_LANGUAGE.test(t) && !rule.exclude.test(t) && POKEMON_CENTER.test(t) === pokemonCenter;
    })
    .map((l) => l.price)
    .filter((p) => reference == null || (p >= reference * 0.5 && p <= reference * 4))
    .sort((a, b) => a - b);
  if (prices.length < MIN_LISTINGS) return null;
  const mid = prices.length >> 1;
  const median = prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  return { price: round2(median), low: prices[0], count: prices.length };
}

/** Recherche sur ebay.fr (neuf, vendeurs en France) : annonces en cours, ou ventes conclues avec `sold`. */
export function ebaySearchUrl(query: string, { sold = false }: { sold?: boolean } = {}): string {
  const params = new URLSearchParams({ _nkw: query, LH_ItemCondition: "1000", LH_PrefLoc: "1" });
  if (sold) {
    params.set("LH_Sold", "1");
    params.set("LH_Complete", "1");
  } else {
    params.set("LH_BIN", "1");
  }
  return `https://www.ebay.fr/sch/i.html?${params}`;
}
