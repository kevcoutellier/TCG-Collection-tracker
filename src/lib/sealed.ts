import { cacheLife } from "next/cache";
import { getSealedExpansionList, getSealedProducts, normalizeSetName, searchSealedProducts, type SealedProduct } from "./cardmarket";
import { getJapaneseSets } from "./japan";

// Données du sélecteur de produits scellés : extensions Cardmarket enrichies du nom français
// (via TCGdex) et repérage des extensions japonaises.

async function getFrenchSetNames(): Promise<Record<string, string>> {
  "use cache";
  cacheLife("days");
  const load = async (lang: "en" | "fr") => {
    const res = await fetch(`https://api.tcgdex.net/v2/${lang}/sets`, { headers: { accept: "application/json" } });
    return res.ok ? ((await res.json()) as { id: string; name: string }[]) : [];
  };
  const [en, fr] = await Promise.all([load("en"), load("fr")]);
  const frById = new Map(fr.map((s) => [s.id, s.name]));
  const out: Record<string, string> = {};
  for (const s of en) {
    const name = frById.get(s.id);
    if (name) out[normalizeSetName(s.name)] = name;
  }
  return out;
}

/** Résout une promesse ou abandonne après `ms` (le calcul continue et remplit le cache). */
function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

export async function getSealedPickerExpansions() {
  const [{ expansions, updated }, frNames, jpSets] = await Promise.all([
    getSealedExpansionList(),
    getFrenchSetNames().catch(() => ({}) as Record<string, string>),
    // L'index japonais est long à construire la première fois : on ne le fait pas attendre.
    within(getJapaneseSets(), 2500),
  ]);
  const jpByExpansion = new Map((jpSets ?? []).filter((s) => s.idExpansion).map((s) => [s.idExpansion!, s]));
  return {
    updated,
    expansions: expansions.map((e) => {
      const jp = jpByExpansion.get(e.id);
      const alias = frNames[normalizeSetName(e.label)];
      return {
        ...e,
        alias: alias && alias !== e.label ? alias : null,
        jp: jp ? { code: jp.id, name: jp.name } : null,
      };
    }),
  };
}

function toOption(p: SealedProduct & { expansion?: string }) {
  return {
    idProduct: p.idProduct,
    name: p.name,
    category: p.category,
    type: p.type,
    dateAdded: p.dateAdded,
    price: p.price.price,
    avg30: p.price.avg30,
    expansion: p.expansion ?? null,
  };
}

// Le catalogue Cardmarket est en anglais : on traduit les termes français courants.
const SYNONYMS: Record<string, string | string[]> = {
  etb: "elitetrainerbox",
  elite: ["elitetrainerbox", "elite"],
  display: ["boosterbox", "display"],
  upc: ["ultrapremiumcollection", "upc"],
  pokebox: "tin",
  tripack: ["3pack", "tripack"],
  dracaufeu: "charizard",
  noctali: "umbreon",
  evoli: "eevee",
  mentali: "espeon",
  pyroli: "flareon",
  aquali: "vaporeon",
  voltali: "jolteon",
  phyllali: "leafeon",
  givrali: "glaceon",
  nymphali: "sylveon",
  tortank: "blastoise",
  florizarre: "venusaur",
  ectoplasma: "gengar",
  amphinobi: "greninja",
  dracolosse: "dragonite",
  ronflex: "snorlax",
  salameche: "charmander",
};
const STOPWORDS = new Set(["coffret", "dresseur", "de", "du", "des", "la", "le", "les", "l", "d", "et", "boite", "pokemon"]);

export async function searchSealedPickerProducts(query: string) {
  const frNames = await getFrenchSetNames().catch(() => ({}) as Record<string, string>);
  let words = query.split(/[\s'’]+/).map(normalizeSetName).filter(Boolean);
  // Nom d'extension français (« Évolutions Prismatiques ») → nom anglais du catalogue.
  const compact = normalizeSetName(query);
  const extra: string[] = [];
  const frToEn = Object.entries(frNames)
    .map(([en, fr]) => [normalizeSetName(fr), en] as const)
    .filter(([fr]) => fr.length >= 4)
    .sort((a, b) => b[0].length - a[0].length);
  const hit = frToEn.find(([fr]) => compact.includes(fr));
  if (hit) {
    extra.push(hit[1]);
    words = words.filter((w) => !hit[0].includes(w));
  }
  const tokens = [...new Set([...words.filter((w) => !STOPWORDS.has(w)), ...extra])].map((w) => [SYNONYMS[w] ?? w].flat());
  return (await searchSealedProducts(tokens)).map(toOption);
}

export async function getSealedPickerProducts(idExpansion: number) {
  return (await getSealedProducts(idExpansion)).map(toOption);
}
