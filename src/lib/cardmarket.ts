import { priceFromPricing } from "./pricing";
import type { CardmarketPricing, PriceInfo } from "./types";

// Catalogue public de Cardmarket (mis à jour quotidiennement) : liste des produits Pokémon et
// guide des prix. On s'en sert pour coter automatiquement les produits scellés et pour retrouver
// le nom anglais d'une extension (y compris japonaise) à partir d'une carte.
const BASE = "https://downloads.s3.cardmarket.com/productCatalog";
const TTL_MS = 6 * 60 * 60 * 1000;

interface RawProduct {
  idProduct: number;
  name: string;
  idCategory: number;
  categoryName: string;
  idExpansion: number;
  dateAdded?: string;
}

type RawPrice = CardmarketPricing & { idProduct: number; idCategory?: number };

export type SealedType = "display" | "etb" | "coffret" | "booster" | "tripack" | "tin" | "deck" | "bundle" | "other";

const CATEGORIES: Record<string, { type: SealedType; label: string; order: number }> = {
  "Pokémon Display": { type: "display", label: "Display", order: 1 },
  "Pokémon Elite Trainer Boxes": { type: "etb", label: "Coffret Dresseur d'Élite", order: 2 },
  "Pokémon Box Set": { type: "coffret", label: "Coffret", order: 3 },
  "PCG Set": { type: "coffret", label: "Coffret", order: 3 },
  "Pokémon Booster": { type: "booster", label: "Booster", order: 4 },
  "Pokémon Blisters": { type: "tripack", label: "Blister / Tripack", order: 5 },
  "Pokémon Tins": { type: "tin", label: "Pokébox / Tin", order: 6 },
  "Pokémon Theme Decks": { type: "deck", label: "Deck", order: 7 },
  "Pokémon Trainer Kits": { type: "deck", label: "Kit du dresseur", order: 7 },
  "Pokémon Lot": { type: "bundle", label: "Lot", order: 8 },
};

export interface SealedProduct {
  idProduct: number;
  name: string;
  category: string;
  type: SealedType;
  order: number;
  idExpansion: number;
  dateAdded: string | null;
  price: PriceInfo;
}

export interface SealedExpansion {
  id: number;
  /** Nom anglais déduit des produits (« Prismatic Evolutions »). */
  label: string;
  /** Date d'ajout du premier produit : proche de la sortie de l'extension. */
  first: string | null;
  latest: string | null;
  count: number;
  /** Groupe fourre-tout de Cardmarket (coffrets, tins… sans extension propre). */
  misc: boolean;
}

interface SealedCatalog {
  products: Map<number, SealedProduct>;
  expansions: Map<number, SealedExpansion & { ids: number[] }>;
  updated: string | null;
}

/* ---------- Cache mémoire (fichiers de plusieurs Mo, rechargés toutes les 6 h) ---------- */

type Entry<T> = { at: number; promise: Promise<T> };
const store = globalThis as unknown as { __pokefolioCardmarket?: Record<string, Entry<unknown>> };

function memo<T>(name: string, load: () => Promise<T>): Promise<T> {
  const cache = (store.__pokefolioCardmarket ??= {});
  const hit = cache[name] as Entry<T> | undefined;
  // Horloge monotone : seule une durée compte ici, et `Date.now()` est interdit pendant le prérendu.
  const now = performance.now();
  if (hit && now - hit.at < TTL_MS) return hit.promise;
  const promise = load().catch((err) => {
    delete cache[name];
    throw err;
  });
  cache[name] = { at: now, promise };
  return promise;
}

async function download<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Catalogue Cardmarket indisponible (${res.status})`);
  return (await res.json()) as T;
}

/** Nom d'extension déduit des noms de produits (« X Booster », « X Booster Box »…) ; null si introuvable. */
export function expansionLabel(names: string[]): string | null {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  // Display et ETB d'abord : « X Sleeved Booster » donnerait un nom tronqué.
  const patterns = [/^(.+?) Booster (?:Box|Display|Bundle)\b/, /^(.+?) Elite Trainer Box\b/, /^(.+?) Booster$/];
  for (const re of patterns) {
    // Le plus court candidat : « Delta Reign » plutôt que « Delta Reign 6 » (lot de 6 displays).
    const candidates = clean
      .map((n) => re.exec(n)?.[1])
      .filter((c): c is string => c != null && c.length >= 2)
      .map((c) => c.replace(/\s+(?:\d+\s+)?Sleeved$/i, "").replace(/[:\-–]\s*$/, "").trim())
      .sort((a, b) => a.length - b.length);
    if (candidates.length) return candidates[0];
  }
  if (clean.length > 1) {
    // Ponctuation finale ignorée : « Set » et « Set: » sont le même mot.
    const words = clean.map((n) => n.split(/\s+/).map((w) => w.replace(/[:,]$/, "")));
    const prefix: string[] = [];
    for (let i = 0; i < words[0].length; i++) {
      if (words.some((w) => w[i] !== words[0][i])) break;
      prefix.push(words[0][i]);
    }
    const p = prefix.join(" ").replace(/[:\-–&,]\s*$/, "").trim();
    if (p.length >= 3) return p;
  }
  return clean.length === 1 ? clean[0] : null;
}

function getSealedCatalog(): Promise<SealedCatalog> {
  // Clé versionnée : un changement de format invalide le cache mémoire (rechargement à chaud).
  return memo("sealed-v4", async () => {
    const [list, guide] = await Promise.all([
      download<{ products: RawProduct[] }>("productList/products_nonsingles_6.json"),
      download<{ createdAt?: string; priceGuides: RawPrice[] }>("priceGuide/price_guide_6.json"),
    ]);
    const prices = new Map(guide.priceGuides.map((p) => [p.idProduct, p]));
    const products = new Map<number, SealedProduct>();
    const expansions = new Map<number, SealedExpansion & { ids: number[]; names: string[] }>();
    for (const p of list.products) {
      const cat = CATEGORIES[p.categoryName];
      if (!cat) continue; // pièces et accessoires exclus
      const date = p.dateAdded && !p.dateAdded.startsWith("0000") ? p.dateAdded.slice(0, 10) : null;
      products.set(p.idProduct, {
        idProduct: p.idProduct,
        name: p.name,
        category: cat.label,
        type: cat.type,
        order: cat.order,
        idExpansion: p.idExpansion,
        dateAdded: date,
        price: priceFromPricing({ cardmarket: prices.get(p.idProduct) ?? null }, { holo: false, tcgKeys: [] }, 1),
      });
      const e = expansions.get(p.idExpansion) ?? {
        id: p.idExpansion,
        label: "",
        first: null,
        latest: null,
        count: 0,
        misc: false,
        ids: [],
        names: [],
      };
      e.ids.push(p.idProduct);
      e.names.push(p.name);
      e.count++;
      if (date && (!e.latest || date > e.latest)) e.latest = date;
      if (date && (!e.first || date < e.first)) e.first = date;
      expansions.set(p.idExpansion, e);
    }
    for (const e of expansions.values()) {
      const label = expansionLabel(e.names);
      e.misc = label == null;
      e.label = label ?? `Coffrets et produits divers (${e.count})`;
    }
    return { products, expansions, updated: guide.createdAt ?? null };
  });
}

/** idProduct (carte) → idExpansion : relie une carte TCGdex à son extension Cardmarket. */
export function getSinglesExpansionMap(): Promise<Map<number, number>> {
  return memo("singles", async () => {
    const list = await download<{ products: RawProduct[] }>("productList/products_singles_6.json");
    return new Map(list.products.map((p) => [p.idProduct, p.idExpansion]));
  });
}

export async function getSealedProduct(idProduct: number): Promise<SealedProduct | null> {
  return (await getSealedCatalog()).products.get(idProduct) ?? null;
}

export async function getSealedProducts(idExpansion: number): Promise<SealedProduct[]> {
  const cat = await getSealedCatalog();
  const exp = cat.expansions.get(idExpansion);
  if (!exp) return [];
  return exp.ids
    .map((id) => cat.products.get(id)!)
    .sort((a, b) => a.order - b.order || (b.price.price ?? -1) - (a.price.price ?? -1));
}

export async function getSealedExpansionList(): Promise<{ expansions: SealedExpansion[]; updated: string | null }> {
  const cat = await getSealedCatalog();
  const expansions = [...cat.expansions.values()]
    .map(({ id, label, first, latest, count, misc }) => ({ id, label, first, latest, count, misc }))
    // Extensions les plus récentes d'abord, groupes fourre-tout en fin de liste.
    .sort((a, b) => Number(a.misc) - Number(b.misc) || (b.first ?? "").localeCompare(a.first ?? ""));
  return { expansions, updated: cat.updated };
}

/**
 * Recherche dans les noms de produits scellés. Chaque mot est une liste d'alternatives normalisées
 * (« display » → booster box ou display) : au moins une doit figurer dans le nom.
 */
export async function searchSealedProducts(words: string[][], limit = 40): Promise<(SealedProduct & { expansion: string })[]> {
  if (!words.length) return [];
  const cat = await getSealedCatalog();
  const out: (SealedProduct & { expansion: string })[] = [];
  for (const p of cat.products.values()) {
    const exp = cat.expansions.get(p.idExpansion);
    const haystack = normalizeSetName(`${p.name} ${exp?.misc ? "" : exp?.label ?? ""}`);
    if (words.every((alts) => alts.some((w) => haystack.includes(w)))) out.push({ ...p, expansion: exp?.misc ? "" : exp?.label ?? "" });
  }
  return out
    .sort((a, b) => (b.dateAdded ?? "").localeCompare(a.dateAdded ?? "") || a.order - b.order)
    .slice(0, limit);
}

export async function getExpansionLabel(idExpansion: number): Promise<string | null> {
  return (await getSealedCatalog()).expansions.get(idExpansion)?.label ?? null;
}

/** Nom anglais de l'extension Cardmarket d'une carte (utile pour les cartes japonaises). */
export async function getExpansionLabelForCard(cardmarketId: number | null | undefined): Promise<string | null> {
  if (!cardmarketId) return null;
  try {
    const idExpansion = (await getSinglesExpansionMap()).get(cardmarketId);
    return idExpansion ? await getExpansionLabel(idExpansion) : null;
  } catch {
    return null;
  }
}

/** Normalisation pour comparer des noms d'extension entre sources. */
export function normalizeSetName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/pokemon|tcg/g, "")
    .replace(/[^a-z0-9]+/g, "");
}
