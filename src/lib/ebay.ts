import { cacheLife } from "next/cache";
import type { SealedProduct } from "./cardmarket";
import { ebaySearchUrl, frenchSealedSearch, type Listing, type MarketSummary, summarizeListings } from "./ebay-listings";
import { getFrenchExpansionName } from "./sealed";

// Prix du marché français des produits scellés : annonces en cours sur eBay.fr (API Browse).
// Optionnel : définir EBAY_CLIENT_ID et EBAY_CLIENT_SECRET (compte développeur eBay gratuit).
// Ce sont des prix demandés (annonces à prix fixe, neuf, vendeurs en France), pas des ventes conclues :
// l'API des ventes conclues est réservée aux partenaires d'eBay. Les liens « vendus » permettent de comparer.

const API = "https://api.ebay.com";
// Le jeton d'application vaut 2 h : on le renouvelle au bout d'1 h.
const TOKEN_TTL_MS = 60 * 60 * 1000;
const FILTER = "buyingOptions:{FIXED_PRICE},conditions:{NEW},itemLocationCountry:FR";

export function ebayConfigured() {
  return Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
}

const store = globalThis as unknown as { __pokefolioEbayToken?: { at: number; promise: Promise<string> } };

function appToken(): Promise<string> {
  // Horloge monotone : seule une durée compte ici.
  const now = performance.now();
  const hit = store.__pokefolioEbayToken;
  if (hit && now - hit.at < TOKEN_TTL_MS) return hit.promise;
  const promise = requestToken().catch((err) => {
    store.__pokefolioEbayToken = undefined;
    throw err;
  });
  store.__pokefolioEbayToken = { at: now, promise };
  return promise;
}

async function requestToken(): Promise<string> {
  const credentials = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${API}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: { authorization: `Basic ${credentials}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }),
  });
  if (!res.ok) throw new Error(`eBay (jeton) a répondu ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function searchListings(query: string): Promise<Listing[]> {
  "use cache";
  // Annonces relues toutes les heures : assez frais pour une cote, économe en quota (5 000 appels/jour).
  cacheLife("hours");
  const url = `${API}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=100&filter=${encodeURIComponent(FILTER)}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${await appToken()}`, "x-ebay-c-marketplace-id": "EBAY_FR", accept: "application/json" },
  });
  // Erreur (quota, panne) : on lève pour ne pas mettre en cache un résultat vide.
  if (!res.ok) throw new Error(`eBay a répondu ${res.status}`);
  const json = (await res.json()) as { itemSummaries?: { title?: string; price?: { value?: string; currency?: string } }[] };
  return (json.itemSummaries ?? []).flatMap((item) => {
    const price = Number(item.price?.value);
    return item.title && item.price?.currency === "EUR" && price > 0 ? [{ title: item.title, price }] : [];
  });
}

export interface FrenchMarket {
  /** Médiane des annonces eBay.fr ; null sans clé eBay, en cas d'erreur ou avec trop peu d'annonces. */
  summary: MarketSummary | null;
  /** Annonces en cours et ventes conclues sur ebay.fr, pour vérifier. */
  url: string;
  soldUrl: string;
}

/** Marché français d'un produit scellé ; null si on ne sait pas le rechercher sur eBay.fr. */
export async function getFrenchSealedMarket(product: Pick<SealedProduct, "name" | "idExpansion" | "price">): Promise<FrenchMarket | null> {
  const search = frenchSealedSearch(product.name, await getFrenchExpansionName(product.idExpansion).catch(() => null));
  if (!search) return null;
  const links = { url: ebaySearchUrl(search.query), soldUrl: ebaySearchUrl(search.query, { sold: true }) };
  if (!ebayConfigured()) return { summary: null, ...links };
  try {
    const listings = await searchListings(search.query);
    return { summary: summarizeListings(listings, { ...search, reference: product.price.price }), ...links };
  } catch (err) {
    console.warn("Annonces eBay.fr indisponibles :", (err as Error).message);
    return { summary: null, ...links };
  }
}
