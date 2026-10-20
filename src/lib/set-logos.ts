import { mapLimit } from "./async";
import { fetchSetList } from "./tcgdex";
import type { SetSummary } from "./types";

// Logos de secours des extensions. TCGdex ne renvoie un logo que s'il existe dans la langue demandée : beaucoup
// d'extensions n'en ont pas en français, et la plupart des japonaises n'en ont pas du tout. Par ordre de préférence :
//   1. le logo anglais de TCGdex (extensions internationales) ;
//   2. celui de pokemontcg.io (données publiées sur GitHub), rattaché par identifiant ou par nom anglais ;
//   3. celui de ptcg-assets, collection de logos sur GitHub (japonaises récentes comprises), après vérification.

/** Extensions anglaises de pokemontcg.io, avec les URL de leurs logos et symboles. */
const POKEMONTCG_SETS = "https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/sets/en.json";
/** Un dossier par extension (ID pokemontcg.io, `ja_<id>` en japonais), avec `logo.png` et `symbol.png`. */
const PTCG_ASSETS = "https://raw.githubusercontent.com/1niceroli/ptcg-assets/main";

export interface PokemonTcgSet {
  id: string;
  name: string;
  images?: { logo?: string; symbol?: string };
}

export interface SetImages {
  logo: string | null;
  symbol: string | null;
}

/** ID pokemontcg.io possibles pour un ID TCGdex : « sv03.5 » → sv3.5, sv3pt5 ou sv35 ; « swsh3.5 » → swsh35. */
export function pokemonTcgIds(tcgdexId: string): string[] {
  const id = tcgdexId.toLowerCase().replace(/(?<=[a-z])0+(?=\d)/g, "");
  return [...new Set([id, id.replace(".", "pt"), id.replace(".", "")])];
}

/** Nom comparable entre les deux sources : « Pokémon GO » = « Pokemon GO », « HS—Undaunted » = « HS Undaunted ». */
export function comparableName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Logo et symbole de secours d'une extension internationale, par ID TCGdex : TCGdex en anglais d'abord, puis
 * pokemontcg.io, rattaché par ID, sinon par nom anglais (s'il ne désigne qu'une extension).
 */
export function setImagesResolver(english: readonly SetSummary[], pokemonTcg: readonly PokemonTcgSet[]): (id: string) => SetImages {
  const englishById = new Map(english.map((s) => [s.id, s]));
  const byId = new Map(pokemonTcg.map((s) => [s.id, s]));
  const byName = new Map<string, PokemonTcgSet | null>();
  for (const s of pokemonTcg) {
    const key = comparableName(s.name);
    byName.set(key, byName.has(key) ? null : s);
  }
  return (id) => {
    const en = englishById.get(id);
    const match = pokemonTcgIds(id).map((x) => byId.get(x)).find(Boolean) ?? (en ? byName.get(comparableName(en.name)) : undefined);
    return { logo: en?.logo ?? match?.images?.logo ?? null, symbol: en?.symbol ?? match?.images?.symbol ?? null };
  };
}

async function fetchPokemonTcgSets(): Promise<PokemonTcgSet[]> {
  const res = await fetch(POKEMONTCG_SETS, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`GitHub a répondu ${res.status} pour les extensions pokemontcg.io`);
  const data: unknown = await res.json();
  return Array.isArray(data) ? data.filter((s): s is PokemonTcgSet => typeof s?.id === "string" && typeof s?.name === "string") : [];
}

/** Lit les deux sources ; une source indisponible ne fait que réduire les logos trouvés. */
async function fetchSetImagesResolver(): Promise<(id: string) => SetImages> {
  const [english, pokemonTcg] = await Promise.all([
    fetchSetList("en").catch((err) => (console.error("Extensions anglaises TCGdex indisponibles", err), [])),
    fetchPokemonTcgSets().catch((err) => (console.error("Extensions pokemontcg.io indisponibles", err), [])),
  ]);
  return setImagesResolver(english, pokemonTcg);
}

/** Première image de ptcg-assets qui existe parmi ces dossiers (les URL y sont devinées, pas listées). */
async function findAsset(folders: readonly string[], file: "logo.png" | "symbol.png"): Promise<string | null> {
  for (const folder of folders) {
    const url = `${PTCG_ASSETS}/${folder}/${file}`;
    const res = await fetch(url, { method: "HEAD" }).catch(() => null);
    if (res?.ok) return url;
  }
  return null;
}

/** Dossiers ptcg-assets possibles d'une extension TCGdex : « SV2a » (japonais) → ja_sv2a ; « me06 » → me6. */
export function assetFolders(id: string, lang: "fr" | "ja"): string[] {
  return lang === "ja" ? [`ja_${id.toLowerCase()}`] : pokemonTcgIds(id);
}

/**
 * Complète le logo et le symbole des extensions qui n'en ont pas chez TCGdex dans cette langue. Seules ces
 * extensions-là déclenchent des requêtes ; une source injoignable laisse simplement l'image manquante.
 */
export async function completeSetImages<T extends SetImages & { id: string }>(lang: "fr" | "ja", sets: readonly T[]): Promise<T[]> {
  if (sets.every((s) => s.logo && s.symbol)) return [...sets];
  const resolve = lang === "fr" ? await fetchSetImagesResolver() : (): SetImages => ({ logo: null, symbol: null });
  return mapLimit(sets, 16, async (set) => {
    if (set.logo && set.symbol) return set;
    const known = resolve(set.id);
    let folders = assetFolders(set.id, lang);
    let logo = set.logo ?? known.logo;
    if (!logo) {
      logo = await findAsset(folders, "logo.png");
      // Pas de logo dans ptcg-assets : l'extension n'y a pas de dossier, inutile d'y chercher son symbole.
      if (!logo) folders = [];
    }
    const symbol = set.symbol ?? known.symbol ?? (await findAsset(folders, "symbol.png"));
    return { ...set, logo, symbol };
  });
}
