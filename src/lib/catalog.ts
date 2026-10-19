import { io } from "next/cache";
import { after } from "next/server";
import { mapLimit } from "./async";
import {
  type CardRef,
  type CardSummary,
  type CatalogLang,
  type CatalogSerie,
  cardKey,
  catalogIndexedAt,
  findCatalogCards,
  findCatalogSets,
  loadCatalogIndex,
  loadSetCatalog,
  saveCatalogIndex,
  saveSetCatalog,
  setsDueForRefresh,
} from "./catalog-db";
import { fetchSetChecklist, fetchSetInfo, type SetChecklist, type SetInfo } from "./checklist";
import { fetchJapaneseSets, type JapaneseSet } from "./japan";
import { fetchSeriesWithSets, getCard } from "./tcgdex";
import type { SerieDetail } from "./types";

// Catalogue servi depuis la base : une requête au lieu d'un appel TCGdex par carte, et l'app reste utilisable
// si TCGdex ne répond plus. Une copie périmée est servie telle quelle puis rafraîchie après la réponse ;
// le cron /api/cron/catalog la tient à jour sans attendre les visites.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Durée de vie des cartes d'une extension (cotes comprises). */
const CARDS_TTL = 3 * DAY;
/** Durée de vie de la liste des extensions : la japonaise est longue à reconstruire (noms anglais). */
const INDEX_TTL: Record<CatalogLang, number> = { fr: DAY, ja: 7 * DAY };

/** Lectures TCGdex en cours dans ce processus : deux visites simultanées ne copient qu'une fois. */
const inflight = new Map<string, Promise<unknown>>();

function once<T>(key: string, run: () => Promise<T>): Promise<T> {
  let promise = inflight.get(key) as Promise<T> | undefined;
  if (!promise) {
    promise = run().finally(() => inflight.delete(key));
    inflight.set(key, promise);
  }
  return promise;
}

/** Rafraîchit en arrière-plan, après l'envoi de la page ; une erreur laisse simplement l'ancienne copie. */
function refreshLater(label: string, run: () => Promise<unknown>) {
  after(() =>
    run().catch((err) => {
      console.error(`Copie du catalogue (${label}) impossible`, err);
    }),
  );
}

/**
 * Lit une extension sur TCGdex et la copie en base. La copie est faite seulement si toutes les fiches ont été lues :
 * une erreur passagère ne fige pas des cartes sans variantes ni cote. `saved` : la copie a bien été enregistrée.
 */
export function syncSet(id: string, lang: CatalogLang): Promise<{ checklist: SetChecklist; saved: boolean } | null> {
  return once(`set:${lang}:${id}`, async () => {
    const live = await fetchSetChecklist(id, lang);
    if (!live) return null;
    let saved = false;
    if (live.failedCards === 0) {
      saved = await saveSetCatalog(lang, live.checklist).then(
        () => true,
        (err) => (console.error(`Copie de l'extension ${lang}/${id} impossible`, err), false),
      );
    }
    return { checklist: live.checklist, saved };
  });
}

/** Checklist d'une extension : copie en base, ou lecture TCGdex (copiée au passage) si elle n'a jamais été copiée. */
export async function getSetChecklist(id: string, lang: CatalogLang): Promise<SetChecklist | null> {
  // Lecture à la requête, jamais pendant un pré-rendu : la base locale (PGlite) lit l'horloge, la fraîcheur aussi.
  await io();
  const stored = await loadSetCatalog(lang, id).catch((err) => (console.error("Lecture du catalogue impossible", err), null));
  if (stored) {
    if (Date.now() - stored.syncedAt.getTime() > CARDS_TTL) refreshLater(`${lang}/${id}`, () => syncSet(id, lang));
    return stored.checklist;
  }
  return (await syncSet(id, lang))?.checklist ?? null;
}

function internationalIndex(series: SerieDetail[]): CatalogSerie[] {
  return series.map((serie) => ({
    id: serie.id,
    name: serie.name,
    logo: serie.logo ?? null,
    releaseDate: serie.releaseDate ?? null,
    sets: serie.sets.map((set) => ({
      id: set.id,
      name: set.name,
      englishName: null,
      logo: set.logo ?? null,
      symbol: set.symbol ?? null,
      releaseDate: null,
      official: set.cardCount.official,
      total: set.cardCount.total,
    })),
  }));
}

/** Extensions japonaises (de la plus récente à la plus ancienne) regroupées par série, dans l'ordre d'apparition. */
function japaneseIndex(sets: JapaneseSet[]): CatalogSerie[] {
  const series = new Map<string, CatalogSerie>();
  for (const set of sets) {
    let serie = series.get(set.serieId);
    if (!serie) series.set(set.serieId, (serie = { id: set.serieId, name: set.serieLabel, logo: null, releaseDate: null, sets: [] }));
    serie.sets.push({
      id: set.id,
      name: set.name,
      englishName: set.englishName,
      logo: set.logo ?? null,
      symbol: set.symbol ?? null,
      releaseDate: set.releaseDate,
      official: set.cardCount.official,
      total: set.cardCount.total,
    });
  }
  return [...series.values()];
}

/** Relit la liste des extensions sur TCGdex et la copie en base. */
function syncIndex(lang: CatalogLang): Promise<CatalogSerie[]> {
  return once(`index:${lang}`, async () => {
    const series = lang === "fr" ? internationalIndex(await fetchSeriesWithSets("fr")) : japaneseIndex(await fetchJapaneseSets());
    // Liste vide : TCGdex en panne plutôt qu'un catalogue vidé ; la copie précédente est gardée.
    if (series.length) await saveCatalogIndex(lang, series).catch((err) => console.error(`Copie de la liste ${lang} impossible`, err));
    return series;
  });
}

/** Extensions d'un catalogue groupées par série, de la plus récente à la plus ancienne. */
export async function getCatalogIndex(lang: CatalogLang): Promise<CatalogSerie[]> {
  await io();
  const stored = await loadCatalogIndex(lang).catch((err) => (console.error("Lecture du catalogue impossible", err), null));
  if (stored) {
    if (Date.now() - stored.indexedAt.getTime() > INDEX_TTL[lang]) refreshLater(`liste ${lang}`, () => syncIndex(lang));
    return stored.series;
  }
  return syncIndex(lang);
}

/** Fiches courtes des extensions, par ID : copie en base, sinon lecture TCGdex. */
export async function getSetInfos(ids: readonly string[]): Promise<Map<string, SetInfo>> {
  const found = await findCatalogSets(ids).catch((err) => (console.error("Lecture du catalogue impossible", err), new Map<string, SetInfo>()));
  const missing = ids.filter((id) => !found.has(id));
  const live = await mapLimit(missing, 6, (id) => fetchSetInfo(id));
  missing.forEach((id, i) => {
    const info = live[i];
    if (info) found.set(id, info);
  });
  return found;
}

/** Nom et visuel de cartes, par `cardKey` : copie en base, sinon lecture TCGdex. */
export async function getCardSummaries(refs: readonly CardRef[]): Promise<Map<string, CardSummary>> {
  const found = await findCatalogCards(refs).catch((err) => (console.error("Lecture du catalogue impossible", err), new Map<string, CardSummary>()));
  const missing = [...new Map(refs.map((r) => [cardKey(r), r])).values()].filter((r) => !found.has(cardKey(r)));
  const live = await mapLimit(missing, 12, (r) => getCard(r.id, r.lang).catch(() => null));
  missing.forEach((ref, i) => {
    const card = live[i];
    if (card) found.set(cardKey(ref), { id: card.id, name: card.name, image: card.image ?? null });
  });
  return found;
}

export interface CatalogRefresh {
  /** Extensions par liste recopiée (absente si la liste était encore fraîche). */
  index: Partial<Record<CatalogLang, number | string>>;
  synced: number;
  /** Extensions lues avec des fiches en erreur : non copiées, réessayées au prochain passage. */
  incomplete: number;
  failed: number;
  /** Extensions encore à copier, faute de temps : le prochain passage reprend là. */
  remaining: number;
}

/**
 * Passage du cron : listes des extensions, puis cartes des extensions dues (voir `setsDueForRefresh`) jusqu'à
 * épuisement du budget. Chaque extension est enregistrée séparément : un passage interrompu garde son travail.
 */
export async function refreshCatalog({ budgetMs }: { budgetMs: number }): Promise<CatalogRefresh> {
  const deadline = Date.now() + budgetMs;
  const index: CatalogRefresh["index"] = {};
  for (const lang of ["fr", "ja"] as const) {
    const indexedAt = await catalogIndexedAt(lang);
    // Une heure de marge : le cron quotidien ne doit pas tomber quelques secondes avant l'échéance.
    if (indexedAt && Date.now() - indexedAt.getTime() < INDEX_TTL[lang] - HOUR) continue;
    try {
      index[lang] = (await syncIndex(lang)).reduce((n, serie) => n + serie.sets.length, 0);
    } catch (err) {
      index[lang] = err instanceof Error ? err.message : String(err);
    }
  }

  const due = await setsDueForRefresh(new Date(Date.now() - CARDS_TTL + HOUR));
  const result = { index, synced: 0, incomplete: 0, failed: 0 };
  let next = 0;
  // Trois extensions à la fois (16 fiches chacune) : rapide sans surcharger TCGdex.
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < due.length && Date.now() < deadline) {
        const { lang, id } = due[next++];
        try {
          const res = await syncSet(id, lang);
          if (!res) result.failed++;
          else if (res.saved) result.synced++;
          else result.incomplete++;
        } catch (err) {
          console.error(`Copie de l'extension ${lang}/${id} impossible`, err);
          result.failed++;
        }
      }
    }),
  );
  return { ...result, remaining: due.length - next };
}
