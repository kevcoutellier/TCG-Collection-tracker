import { cacheLife, cacheTag } from "next/cache";
import { mapLimit } from "./async";
import type {
  CardBrief,
  CardDetail,
  Lang,
  SerieDetail,
  SetDetail,
} from "./types";

// Client de l'API publique TCGdex : données des cartes + guide des prix Cardmarket/TCGplayer.
const API = "https://api.tcgdex.net/v2";
/** Série « TCG Pocket » (jeu mobile) : cartes numériques sans valeur marchande. */
const POCKET_SERIE = "tcgp";
/** Séries exclues de la navigation : TCG Pocket et kits d'entraînement. */
const HIDDEN_SERIES = new Set([POCKET_SERIE, "tk"]);

async function api<T>(lang: Lang, path: string): Promise<T | null> {
  const res = await fetch(`${API}/${lang}${path}`, {
    headers: { accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`TCGdex a répondu ${res.status} pour ${path}`);
  return (await res.json()) as T;
}

/** URL d'image TCGdex ; les visuels sont servis en `<base>/<qualité>.webp`. */
export function cardImageUrl(base: string | undefined | null, quality: "low" | "high" = "high") {
  return base ? `${base}/${quality}.webp` : null;
}

export async function getCard(id: string, lang: Lang = "fr"): Promise<CardDetail | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(`card:${id}`);
  return api<CardDetail>(lang, `/cards/${encodeURIComponent(id)}`);
}

async function getPocketSetIds(): Promise<string[]> {
  "use cache";
  cacheLife("days");
  const serie = await api<SerieDetail>("en", `/series/${POCKET_SERIE}`);
  return serie?.sets.map((s) => s.id) ?? [];
}

/** Recherche par nom (correspondance partielle, insensible à la casse), hors TCG Pocket. */
export async function searchCardBriefs(query: string, lang: Lang = "fr"): Promise<CardBrief[]> {
  "use cache";
  cacheLife("hours");
  const q = query.trim();
  if (q.length < 2) return [];
  const [briefs, pocket] = await Promise.all([
    api<CardBrief[]>(lang, `/cards?name=${encodeURIComponent(q)}`),
    getPocketSetIds(),
  ]);
  return (briefs ?? []).filter((c) => !pocket.some((setId) => c.id.startsWith(`${setId}-`)));
}

/** Récupère le détail (avec prix) d'une liste de cartes, 16 requêtes à la fois. */
export async function hydrateCards(ids: readonly string[], lang: Lang = "fr"): Promise<CardDetail[]> {
  const cards = await mapLimit(ids, 16, (id) => getCard(id, lang).catch(() => null));
  return cards.filter((c): c is CardDetail => c !== null);
}

const JAPANESE_CHARS = /[぀-ヿ㐀-鿿]/;

/**
 * Recherche de cartes japonaises. Un nom en japonais est cherché tel quel ; un nom français ou
 * anglais (« Dracaufeu ») est converti en numéro de Pokédex, commun à toutes les langues.
 */
export async function searchJapaneseBriefs(query: string): Promise<CardBrief[]> {
  "use cache";
  cacheLife("hours");
  const q = query.trim();
  if (JAPANESE_CHARS.test(q)) return (await api<CardBrief[]>("ja", `/cards?name=${encodeURIComponent(q)}`)) ?? [];
  if (q.length < 2) return [];
  for (const lang of ["fr", "en"] as const) {
    const briefs = await searchCardBriefs(q, lang);
    if (!briefs.length) continue;
    const sample = await hydrateCards(briefs.slice(0, 12).map((b) => b.id), lang);
    const freq = new Map<number, number>();
    for (const c of sample) for (const d of c.dexId ?? []) freq.set(d, (freq.get(d) ?? 0) + 1);
    const top = Math.max(0, ...freq.values());
    // On écarte les Pokémon qui n'apparaissent qu'en duo (« Pikachu & Zekrom-GX »).
    const dexIds = [...freq.entries()].filter(([, n]) => n >= top * 0.5).map(([d]) => d);
    if (!dexIds.length) return [];
    const lists = await Promise.all(dexIds.map((d) => api<CardBrief[]>("ja", `/cards?dexId=eq:${d}`)));
    const seen = new Set<string>();
    return lists.flatMap((l) => l ?? []).filter((c) => !seen.has(c.id) && Boolean(seen.add(c.id)));
  }
  return [];
}

export async function getSet(id: string, lang: Lang = "fr"): Promise<SetDetail | null> {
  "use cache";
  cacheLife("days");
  return api<SetDetail>(lang, `/sets/${encodeURIComponent(id)}`);
}

/** Séries et leurs extensions, de la plus récente à la plus ancienne. */
export async function getSeriesWithSets(lang: Lang = "fr"): Promise<SerieDetail[]> {
  "use cache";
  cacheLife("days");
  const list = (await api<{ id: string; name: string }[]>(lang, "/series")) ?? [];
  const details = await mapLimit(
    list.filter((s) => !HIDDEN_SERIES.has(s.id)),
    6,
    (s) => api<SerieDetail>(lang, `/series/${s.id}`).catch(() => null),
  );
  return details
    .filter((s): s is SerieDetail => s !== null && s.sets.length > 0)
    .map((s) => ({ ...s, sets: [...s.sets].reverse() }))
    .sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));
}

const FALLBACK_USD_EUR = 0.9;

/** Taux USD → EUR du jour (BCE via Frankfurter), pour convertir les prix TCGplayer. */
export async function getUsdToEur(): Promise<number> {
  "use cache";
  cacheLife("days");
  try {
    const res = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR");
    if (!res.ok) return FALLBACK_USD_EUR;
    const data = (await res.json()) as { rates?: { EUR?: number } };
    return data.rates?.EUR ?? FALLBACK_USD_EUR;
  } catch {
    return FALLBACK_USD_EUR;
  }
}
