import { and, desc, eq, max, sql } from "drizzle-orm";
import type { CollectionItem } from "./collection";
import { getDb, schema } from "./db";

// Accès en base à la collection « checklist ». Chaque fonction reçoit l'ID du compte : l'appelant
// l'obtient de `requireUser()`, jamais du client.

const t = schema.collectionItems;

/** Comptes dont le portefeuille a déjà été repris dans ce processus (évite une écriture par requête). */
const imported = new Set<string>();

/**
 * Reprend une seule fois par compte les cartes du portefeuille encore détenues (une ligne par carte,
 * langue et variante, quantités additionnées). Le verrou dans `app_meta` garantit l'unicité de la reprise :
 * une carte retirée ensuite de la collection ne revient pas.
 */
export async function importHoldingsOnce(userId: string): Promise<void> {
  if (imported.has(userId)) return;
  const db = await getDb();
  await db.execute(sql`
    WITH claim AS (
      INSERT INTO app_meta (key, value) VALUES (${`collectionImported:${userId}`}, now()::text)
      ON CONFLICT DO NOTHING
      RETURNING 1
    )
    INSERT INTO collection_items (user_id, card_id, card_lang, variant, set_id, quantity)
    SELECT h.user_id, h.card_id, h.card_lang, h.variant,
           left(h.card_id, length(h.card_id) - strpos(reverse(h.card_id), '-')),
           sum(h.quantity)::int
    FROM holdings h
    WHERE EXISTS (SELECT 1 FROM claim)
      AND h.user_id = ${userId} AND h.kind = 'card' AND h.card_id IS NOT NULL AND h.sold_at IS NULL
    GROUP BY h.user_id, h.card_id, h.card_lang, h.variant
    HAVING sum(h.quantity) > 0
    ON CONFLICT DO NOTHING
  `);
  imported.add(userId);
}

/** Colonnes d'une ligne de collection, au format `CollectionItem`. */
export const itemColumns = { cardId: t.cardId, lang: t.cardLang, setId: t.setId, variant: t.variant, quantity: t.quantity };

/** Lignes de collection d'une extension. */
export async function loadSetItems(userId: string, setId: string): Promise<CollectionItem[]> {
  await importHoldingsOnce(userId);
  const db = await getDb();
  return db.select(itemColumns).from(t).where(and(eq(t.userId, userId), eq(t.setId, setId)));
}

/** Toute la collection du compte. */
export async function loadCollectionItems(userId: string): Promise<CollectionItem[]> {
  await importHoldingsOnce(userId);
  const db = await getDb();
  return db.select(itemColumns).from(t).where(eq(t.userId, userId));
}

export interface OwnedSet {
  /** Cartes différentes possédées (toutes langues et variantes confondues). */
  cardIds: string[];
  /** Dernière modification d'une de ses cartes : les extensions « en cours » se trient dessus. */
  lastUpdate: Date;
}

/** Extensions commencées, de la plus récemment modifiée à la plus ancienne. */
export async function ownedCardsBySet(userId: string): Promise<Map<string, OwnedSet>> {
  await importHoldingsOnce(userId);
  const db = await getDb();
  const rows = await db
    .select({ setId: t.setId, cardId: t.cardId, lastUpdate: max(t.updatedAt) })
    .from(t)
    .where(eq(t.userId, userId))
    .groupBy(t.setId, t.cardId);
  const out = new Map<string, OwnedSet>();
  for (const { setId, cardId, lastUpdate } of rows) {
    const at = lastUpdate ?? new Date(0);
    const set = out.get(setId);
    if (!set) out.set(setId, { cardIds: [cardId], lastUpdate: at });
    else {
      set.cardIds.push(cardId);
      if (at > set.lastUpdate) set.lastUpdate = at;
    }
  }
  return new Map([...out].sort(([, a], [, b]) => b.lastUpdate.getTime() - a.lastUpdate.getTime()));
}

/** Dernières cartes ajoutées ou modifiées. */
export async function loadRecentItems(userId: string, limit: number): Promise<CollectionItem[]> {
  await importHoldingsOnce(userId);
  const db = await getDb();
  return db.select(itemColumns).from(t).where(eq(t.userId, userId)).orderBy(desc(t.updatedAt)).limit(limit);
}

/** Fixe la quantité possédée d'une carte × langue × variante ; à 0, la ligne est supprimée. */
export async function setItemQuantity(userId: string, item: CollectionItem): Promise<void> {
  await importHoldingsOnce(userId);
  const db = await getDb();
  if (item.quantity <= 0) {
    await db
      .delete(t)
      .where(and(eq(t.userId, userId), eq(t.cardId, item.cardId), eq(t.cardLang, item.lang), eq(t.variant, item.variant)));
    return;
  }
  await db
    .insert(t)
    .values({ userId, cardId: item.cardId, cardLang: item.lang, variant: item.variant, setId: item.setId, quantity: item.quantity })
    .onConflictDoUpdate({
      target: [t.userId, t.cardId, t.cardLang, t.variant],
      set: { quantity: item.quantity, setId: item.setId, updatedAt: sql`now()` },
    });
}
