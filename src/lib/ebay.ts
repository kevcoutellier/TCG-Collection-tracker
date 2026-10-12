import { cacheLife } from "next/cache";
import { type EbayListing, filterListings, parseEbayItems } from "./ebay-model";

// Annonces eBay en direct via l'API officielle Browse (eBay France).
// Optionnel : définir EBAY_CLIENT_ID et EBAY_CLIENT_SECRET (clés « Production » gratuites sur
// https://developer.ebay.com). Sans clés, l'app propose une recherche eBay préremplie.

const API = "https://api.ebay.com";

export function ebayConfigured() {
  return Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
}

const store = globalThis as unknown as { __pokefolioEbay?: { token: string; until: number } };

/** Jeton applicatif OAuth (valable 2 h), réutilisé tant qu'il n'expire pas. */
async function appToken(): Promise<string> {
  // Horloge monotone : seule une durée compte (voir cardmarket.ts).
  const now = performance.now();
  if (store.__pokefolioEbay && store.__pokefolioEbay.until > now) return store.__pokefolioEbay.token;
  const credentials = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${API}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: { authorization: `Basic ${credentials}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`eBay OAuth a répondu ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  store.__pokefolioEbay = { token: data.access_token, until: now + Math.max(60, data.expires_in - 300) * 1000 };
  return data.access_token;
}

async function searchRaw(query: string, maxPrice: number | null): Promise<EbayListing[]> {
  "use cache";
  // Les annonces bougent vite, mais une recherche par carte et par quart d'heure suffit largement.
  cacheLife("minutes");
  const filters = ["deliveryCountry:FR", "priceCurrency:EUR"];
  if (maxPrice != null) filters.push(`price:[..${Math.ceil(maxPrice)}]`);
  const params = new URLSearchParams({ q: query, limit: "50", sort: "price", filter: filters.join(",") });
  const res = await fetch(`${API}/buy/browse/v1/item_summary/search?${params}`, {
    headers: {
      authorization: `Bearer ${await appToken()}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_FR",
      "accept-language": "fr-FR",
    },
  });
  // Erreur (quota, panne) : on lève pour ne pas mettre en cache un résultat vide.
  if (!res.ok) throw new Error(`eBay Browse a répondu ${res.status}`);
  return parseEbayItems(await res.json());
}

/**
 * Annonces eBay les moins chères pour une carte (port compris), filtrées ; null si eBay n'est pas
 * configuré ou indisponible.
 */
export async function searchEbayListings(
  query: string,
  opts: { maxPrice?: number | null; number?: string | null; total?: number | null; graded?: boolean } = {},
): Promise<EbayListing[] | null> {
  if (!ebayConfigured()) return null;
  try {
    return filterListings(await searchRaw(query, opts.maxPrice ?? null), opts);
  } catch (err) {
    console.warn("Annonces eBay indisponibles :", (err as Error).message);
    return null;
  }
}
