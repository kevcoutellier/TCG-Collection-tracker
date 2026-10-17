import { mapLimit } from "./async";
import { getSetInfo, type SetInfo } from "./checklist";
import { type CollectionItem, type CollectionTotals, collectionTotals, countOfficial } from "./collection";
import { loadCollectionItems, ownedCardsBySet } from "./collection-db";

// Vue d'ensemble de la collection d'un compte, pour l'accueil et le profil.

export interface StartedSet extends SetInfo {
  /** Cartes officielles possédées. */
  owned: number;
  pct: number;
  lastUpdate: Date;
}

export interface CollectionOverview {
  items: CollectionItem[];
  totals: CollectionTotals;
  /** Extensions commencées, de la plus récemment modifiée à la plus ancienne. */
  sets: StartedSet[];
  completed: number;
}

export async function loadCollectionOverview(userId: string): Promise<CollectionOverview> {
  const [items, owned] = await Promise.all([loadCollectionItems(userId), ownedCardsBySet(userId)]);
  const entries = [...owned];
  const infos = await mapLimit(entries, 6, ([setId]) => getSetInfo(setId));
  const sets = entries.flatMap(([, set], i): StartedSet[] => {
    const info = infos[i];
    // Extension inconnue du catalogue (ID repris d'une ancienne saisie) : comptée dans les totaux seulement.
    if (!info) return [];
    const n = countOfficial(set.cardIds, info.official, info.total);
    return [{ ...info, owned: n, pct: Math.min(100, Math.round((n / info.official) * 100)), lastUpdate: set.lastUpdate }];
  });
  return { items, totals: collectionTotals(items), sets, completed: sets.filter((s) => s.owned >= s.official).length };
}
