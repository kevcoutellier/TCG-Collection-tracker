import { cacheLife } from "next/cache";
import { parseSalesByGrade, type SalesByGrade } from "./graded-model";
import type { Lang } from "./types";

// Ventes réelles de cartes gradées (eBay) via l'API PokemonPriceTracker.
// Optionnel : définir POKEMONPRICETRACKER_API_KEY (offre gratuite : 100 crédits/jour, 2 crédits par carte).
// Sans clé, l'app utilise le modèle d'estimation de graded-model.ts.

const API = "https://www.pokemonpricetracker.com/api/v2/cards";

export function gradedSalesConfigured() {
  return Boolean(process.env.POKEMONPRICETRACKER_API_KEY);
}

async function fetchSales(tcgplayerId: number, japanese: boolean): Promise<unknown> {
  "use cache";
  // Cache long : les ventes gradées bougent lentement et le quota gratuit est limité.
  cacheLife("days");
  const key = process.env.POKEMONPRICETRACKER_API_KEY;
  if (!key) return null;
  const url = `${API}?tcgPlayerId=${tcgplayerId}&includeEbay=true${japanese ? "&language=japanese" : ""}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, accept: "application/json" } });
  if (res.status === 404) return null;
  // Erreur (quota, panne) : on lève pour ne pas mettre en cache un résultat vide.
  if (!res.ok) throw new Error(`PokemonPriceTracker a répondu ${res.status}`);
  const json = (await res.json()) as { data?: unknown };
  const card = Array.isArray(json.data) ? json.data[0] : json.data;
  return (card as { ebay?: { salesByGrade?: unknown } } | undefined)?.ebay?.salesByGrade ?? null;
}

/** Ventes par note pour un produit TCGplayer, converties en EUR ; null si indisponible. */
export async function getGradedSales(tcgplayerId: number | null, lang: Lang, usdToEur: number): Promise<SalesByGrade | null> {
  if (!tcgplayerId || !gradedSalesConfigured()) return null;
  try {
    return parseSalesByGrade(await fetchSales(tcgplayerId, lang === "ja"), usdToEur);
  } catch (err) {
    console.warn("Ventes gradées indisponibles :", (err as Error).message);
    return null;
  }
}
