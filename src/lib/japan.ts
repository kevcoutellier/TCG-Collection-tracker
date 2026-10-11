import { cacheLife } from "next/cache";
import { mapLimit } from "./async";
import { getExpansionLabel, getSinglesExpansionMap } from "./cardmarket";
import { getCard, getSet } from "./tcgdex";
import type { SetSummary } from "./types";

// Extensions japonaises (TCGdex « ja »). Leurs noms sont en japonais : on retrouve le nom anglais
// via le catalogue Cardmarket (carte → extension Cardmarket → nom de ses produits scellés).

export const JA_SERIES_LABELS: Record<string, string> = {
  PMCG: "Pocket Monsters Card Game (1996-2001)",
  neo: "Neo",
  VS: "VS",
  web: "Web",
  e: "Card e",
  ADV: "ADV",
  PCG: "PCG",
  L: "LEGEND",
  XY: "XY",
  XYb: "XY BREAK",
  SM: "Soleil et Lune",
  S: "Épée et Bouclier",
  SV: "Écarlate et Violet",
  M: "MEGA",
};

export interface JapaneseSet extends SetSummary {
  englishName: string | null;
  idExpansion: number | null;
  serieId: string;
  serieLabel: string;
  releaseDate: string | null;
}

export async function getJapaneseSets(): Promise<JapaneseSet[]> {
  "use cache";
  cacheLife("days");
  const res = await fetch("https://api.tcgdex.net/v2/ja/sets", { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`TCGdex a répondu ${res.status} pour les extensions japonaises`);
  const list = (await res.json()) as SetSummary[];
  const singles = await getSinglesExpansionMap().catch(() => new Map<number, number>());

  const sets = await mapLimit(list, 12, async (s): Promise<JapaneseSet | null> => {
    const set = await getSet(s.id, "ja").catch(() => null);
    if (!set) return null;
    let idExpansion: number | null = null;
    // Quelques cartes suffisent pour retrouver l'extension Cardmarket correspondante.
    for (const c of set.cards.slice(-3)) {
      const card = await getCard(c.id, "ja").catch(() => null);
      const pid = card?.pricing?.cardmarket?.idProduct ?? card?.variants_detailed?.[0]?.thirdParty?.cardmarket ?? null;
      if (pid && singles.has(pid)) {
        idExpansion = singles.get(pid)!;
        break;
      }
    }
    return {
      id: set.id,
      name: set.name,
      logo: set.logo,
      symbol: set.symbol,
      cardCount: set.cardCount,
      releaseDate: set.releaseDate ?? null,
      serieId: set.serie.id,
      serieLabel: JA_SERIES_LABELS[set.serie.id] ?? set.serie.id,
      idExpansion,
      englishName: idExpansion ? await getExpansionLabel(idExpansion).catch(() => null) : null,
    };
  });
  return sets
    .filter((s): s is JapaneseSet => s !== null)
    .sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));
}

export async function getJapaneseSet(id: string): Promise<JapaneseSet | null> {
  return (await getJapaneseSets()).find((s) => s.id === id) ?? null;
}
