import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { SetChecklist, SetInfo } from "./checklist";
import { getDb, schema } from "./db";
import type { Lang } from "./types";

// Copie du catalogue TCGdex en base (tables catalog_sets et catalog_cards) : lecture et écriture seulement,
// lib/catalog.ts décide quand interroger TCGdex.

export type CatalogLang = "fr" | "ja";

/** Catalogue d'une langue de carte : les cartes anglaises et françaises partagent le catalogue international. */
export const catalogLang = (lang: Lang): CatalogLang => (lang === "ja" ? "ja" : "fr");

export interface CatalogSetEntry {
  id: string;
  name: string;
  /** Nom anglais d'une extension japonaise (via Cardmarket). */
  englishName: string | null;
  logo: string | null;
  symbol: string | null;
  releaseDate: string | null;
  official: number;
  total: number;
}

export interface CatalogSerie {
  id: string;
  name: string;
  logo: string | null;
  releaseDate: string | null;
  sets: CatalogSetEntry[];
}

const s = schema.catalogSets;
const c = schema.catalogCards;

/** Rang d'une extension copiée avant d'apparaître dans la liste (ouverte par un lien direct) : en fin de liste. */
const UNLISTED = 1_000_000;
/** Lignes par INSERT : reste loin de la limite de 65 535 paramètres de Postgres. */
const CHUNK = 1000;

const indexKey = (lang: CatalogLang) => `catalogIndexedAt:${lang}`;

function uniqueById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.id) && (seen.add(item.id), true));
}

function chunks<T>(items: readonly T[]): T[][] {
  return Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, i) => items.slice(i * CHUNK, (i + 1) * CHUNK));
}

/**
 * Enregistre la liste des extensions d'un catalogue, dans l'ordre d'affichage. Rien n'est supprimé : une série
 * que TCGdex n'a pas renvoyée cette fois (erreur passagère) garde ses extensions. Le nom anglais et la date de
 * sortie déjà connus sont conservés quand la liste ne les donne pas (la liste internationale n'a pas de dates).
 */
export async function saveCatalogIndex(lang: CatalogLang, series: readonly CatalogSerie[]): Promise<void> {
  const rows = uniqueById(series.flatMap((serie) => serie.sets.map((set) => ({ ...set, serie })))).map(({ serie, ...set }, position) => ({
    ...set,
    lang,
    serieId: serie.id,
    serieName: serie.name,
    serieLogo: serie.logo,
    serieReleaseDate: serie.releaseDate,
    position,
  }));
  if (!rows.length) return;
  const db = await getDb();
  await db.transaction(async (tx) => {
    for (const chunk of chunks(rows)) {
      await tx
        .insert(s)
        .values(chunk)
        .onConflictDoUpdate({
          target: [s.lang, s.id],
          set: {
            serieId: sql`excluded.serie_id`,
            serieName: sql`excluded.serie_name`,
            serieLogo: sql`excluded.serie_logo`,
            serieReleaseDate: sql`excluded.serie_release_date`,
            name: sql`excluded.name`,
            englishName: sql`coalesce(excluded.english_name, ${s.englishName})`,
            logo: sql`excluded.logo`,
            symbol: sql`excluded.symbol`,
            releaseDate: sql`coalesce(excluded.release_date, ${s.releaseDate})`,
            official: sql`excluded.official`,
            total: sql`excluded.total`,
            position: sql`excluded.position`,
            indexedAt: sql`now()`,
          },
        });
    }
    await tx
      .insert(schema.appMeta)
      .values({ key: indexKey(lang), value: new Date().toISOString() })
      .onConflictDoUpdate({ target: schema.appMeta.key, set: { value: sql`excluded.value` } });
  });
}

/** Date de la dernière copie de la liste des extensions ; nulle tant qu'elle n'a jamais été copiée. */
export async function catalogIndexedAt(lang: CatalogLang): Promise<Date | null> {
  const db = await getDb();
  const [meta] = await db.select({ value: schema.appMeta.value }).from(schema.appMeta).where(eq(schema.appMeta.key, indexKey(lang)));
  return meta ? new Date(meta.value) : null;
}

/** Liste des extensions groupées par série, dans l'ordre d'affichage. */
export async function loadCatalogIndex(lang: CatalogLang): Promise<{ series: CatalogSerie[]; indexedAt: Date } | null> {
  const db = await getDb();
  const [indexedAt, rows] = await Promise.all([
    catalogIndexedAt(lang),
    db.select().from(s).where(eq(s.lang, lang)).orderBy(asc(s.position), asc(s.id)),
  ]);
  // Sans liste copiée, seules les extensions ouvertes par lien direct sont connues : liste incomplète.
  if (!indexedAt) return null;
  const series: CatalogSerie[] = [];
  const byId = new Map<string, CatalogSerie>();
  for (const r of rows) {
    let serie = byId.get(r.serieId);
    if (!serie) {
      serie = { id: r.serieId, name: r.serieName, logo: r.serieLogo, releaseDate: r.serieReleaseDate, sets: [] };
      byId.set(r.serieId, serie);
      series.push(serie);
    }
    const { id, name, englishName, logo, symbol, releaseDate, official, total } = r;
    serie.sets.push({ id, name, englishName, logo, symbol, releaseDate, official, total });
  }
  return { series, indexedAt };
}

/** Remplace les cartes d'une extension par leur dernière lecture sur TCGdex. */
export async function saveSetCatalog(lang: CatalogLang, { set, englishName, cards }: SetChecklist): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .insert(s)
      .values({
        lang,
        id: set.id,
        serieId: set.serie.id,
        serieName: set.serie.name,
        name: set.name,
        englishName,
        logo: set.logo ?? null,
        symbol: set.symbol ?? null,
        releaseDate: set.releaseDate ?? null,
        official: set.cardCount.official,
        total: set.cardCount.total,
        position: UNLISTED,
        cardsSyncedAt: sql`now()`,
      })
      .onConflictDoUpdate({
        target: [s.lang, s.id],
        // La série et le rang restent ceux de la liste des extensions.
        set: {
          name: sql`excluded.name`,
          englishName: sql`coalesce(excluded.english_name, ${s.englishName})`,
          logo: sql`excluded.logo`,
          symbol: sql`excluded.symbol`,
          releaseDate: sql`coalesce(excluded.release_date, ${s.releaseDate})`,
          official: sql`excluded.official`,
          total: sql`excluded.total`,
          cardsSyncedAt: sql`now()`,
        },
      });
    await tx.delete(c).where(and(eq(c.lang, lang), eq(c.setId, set.id)));
    const rows = uniqueById(cards).map(({ id, localId, name, image, rarity, price, variants }, position) => ({
      lang,
      id,
      setId: set.id,
      position,
      localId,
      name,
      image,
      rarity,
      price,
      variants,
    }));
    for (const chunk of chunks(rows)) {
      await tx
        .insert(c)
        .values(chunk)
        .onConflictDoUpdate({
          // Carte déjà rangée dans une autre extension (cas exceptionnel côté TCGdex) : elle suit la dernière lecture.
          target: [c.lang, c.id],
          set: {
            setId: sql`excluded.set_id`,
            position: sql`excluded.position`,
            localId: sql`excluded.local_id`,
            name: sql`excluded.name`,
            image: sql`excluded.image`,
            rarity: sql`excluded.rarity`,
            price: sql`excluded.price`,
            variants: sql`excluded.variants`,
          },
        });
    }
  });
}

/** Checklist d'une extension copiée en base ; nulle si ses cartes n'ont jamais été copiées. */
export async function loadSetCatalog(lang: CatalogLang, id: string): Promise<{ checklist: SetChecklist; syncedAt: Date } | null> {
  const db = await getDb();
  const [[row], cards] = await Promise.all([
    db.select().from(s).where(and(eq(s.lang, lang), eq(s.id, id))),
    db
      .select({ id: c.id, localId: c.localId, name: c.name, image: c.image, rarity: c.rarity, price: c.price, variants: c.variants })
      .from(c)
      .where(and(eq(c.lang, lang), eq(c.setId, id)))
      .orderBy(asc(c.position)),
  ]);
  if (!row?.cardsSyncedAt) return null;
  return {
    checklist: {
      set: {
        id: row.id,
        name: row.name,
        logo: row.logo ?? undefined,
        symbol: row.symbol ?? undefined,
        releaseDate: row.releaseDate ?? undefined,
        cardCount: { official: row.official, total: row.total },
        serie: { id: row.serieId, name: row.serieName },
      },
      englishName: row.englishName,
      cards,
    },
    syncedAt: row.cardsSyncedAt,
  };
}

/** Fiches courtes des extensions connues, par ID (catalogue international d'abord, comme en lecture directe). */
export async function findCatalogSets(ids: readonly string[]): Promise<Map<string, SetInfo>> {
  const found = new Map<string, SetInfo>();
  if (!ids.length) return found;
  const db = await getDb();
  const rows = await db
    .select({ id: s.id, name: s.name, logo: s.logo, symbol: s.symbol, official: s.official, total: s.total, lang: s.lang })
    .from(s)
    .where(inArray(s.id, [...ids]));
  rows.sort((a, b) => Number(b.lang === "fr") - Number(a.lang === "fr"));
  for (const r of rows) if (!found.has(r.id)) found.set(r.id, { ...r, official: r.official || r.total });
  return found;
}

export interface CardRef {
  id: string;
  lang: CatalogLang;
}

export interface CardSummary {
  id: string;
  name: string;
  image: string | null;
}

/** Clé des cartes dans les résultats de `findCatalogCards` : le même ID peut exister dans les deux catalogues. */
export const cardKey = ({ id, lang }: CardRef) => `${lang}:${id}`;

/** Nom et visuel des cartes copiées en base, par `cardKey`. */
export async function findCatalogCards(refs: readonly CardRef[]): Promise<Map<string, CardSummary>> {
  const found = new Map<string, CardSummary>();
  if (!refs.length) return found;
  const db = await getDb();
  const wanted = new Set(refs.map(cardKey));
  const rows = await db
    .select({ lang: c.lang, id: c.id, name: c.name, image: c.image })
    .from(c)
    .where(inArray(c.id, [...new Set(refs.map((r) => r.id))]));
  for (const { lang, ...card } of rows) {
    const key = cardKey({ id: card.id, lang });
    if (wanted.has(key)) found.set(key, card);
  }
  return found;
}

/**
 * Extensions dont les cartes sont à (re)copier, par priorité : celles qu'au moins un compte collectionne,
 * puis celles jamais copiées (les plus récentes d'abord), puis les copies les plus anciennes.
 */
export async function setsDueForRefresh(staleBefore: Date): Promise<{ lang: CatalogLang; id: string }[]> {
  const db = await getDb();
  const collected = db.selectDistinct({ setId: schema.collectionItems.setId }).from(schema.collectionItems).as("collected");
  return db
    .select({ lang: s.lang, id: s.id })
    .from(s)
    .leftJoin(collected, eq(collected.setId, s.id))
    .where(or(isNull(s.cardsSyncedAt), lt(s.cardsSyncedAt, staleBefore)))
    .orderBy(sql`${collected.setId} IS NULL`, sql`${s.cardsSyncedAt} ASC NULLS FIRST`, asc(s.position), asc(s.id));
}
