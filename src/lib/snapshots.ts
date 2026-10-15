import { and, eq, isNull } from "drizzle-orm";
import { cardKey, priceKey } from "./analysis";
import { mapLimit } from "./async";
import { getDb, schema } from "./db";
import { todayISO } from "./format";
import { cardVariants } from "./pricing";
import { getCard, getUsdToEur } from "./tcgdex";
import type { CardDetail, Lang, PriceInfo } from "./types";
import { quoteHoldings } from "./valuation";

// Les API gratuites ne donnent que le prix du jour (+ moyennes 1/7/30 j) : l'historique long terme
// est construit en enregistrant un relevé quotidien de chaque objet suivi.

async function upsertSnapshot(itemKey: string, info: Partial<PriceInfo> & { price: number | null }, day = todayISO()) {
  if (info.price == null) return false;
  const values = {
    price: info.price,
    low: info.low ?? null,
    avg1: info.avg1 ?? null,
    avg7: info.avg7 ?? null,
    avg30: info.avg30 ?? null,
    usdMarket: info.usdMarket ?? null,
  };
  const db = await getDb();
  await db
    .insert(schema.priceSnapshots)
    .values({ itemKey, day, ...values })
    .onConflictDoUpdate({ target: [schema.priceSnapshots.itemKey, schema.priceSnapshots.day], set: values });
  return true;
}

/** Relevé du jour de chaque variante cotée d'une carte. */
export async function recordCardSnapshot(card: CardDetail, fx: number, day = todayISO()) {
  const results = await Promise.all(cardVariants(card, fx).map((v) => upsertSnapshot(cardKey(card.id, v.key), v.price, day)));
  return results.some(Boolean);
}

export async function recordManualSnapshot(holdingId: string, price: number, day = todayISO()) {
  await upsertSnapshot(`manual:${holdingId}`, { price }, day);
}

export async function recordKeySnapshot(itemKey: string, price: number | null, day = todayISO()) {
  await upsertSnapshot(itemKey, { price }, day);
}

/**
 * Relève le prix du jour des cartes et produits détenus ou surveillés : ceux d'un compte, ou de tous les comptes
 * (cron, relevé quotidien). Les relevés sont communs : une carte suivie par deux comptes n'est relevée qu'une fois.
 */
export async function refreshTrackedPrices(userId?: string) {
  const db = await getDb();
  const [held, watched] = await Promise.all([
    db
      .select()
      .from(schema.holdings)
      .where(and(isNull(schema.holdings.soldAt), userId ? eq(schema.holdings.userId, userId) : undefined)),
    db
      .select({ cardId: schema.watchlist.cardId, cardLang: schema.watchlist.cardLang })
      .from(schema.watchlist)
      .where(userId ? eq(schema.watchlist.userId, userId) : undefined),
  ]);
  const targets = new Map<string, { id: string; lang: Lang }>();
  for (const t of [...held, ...watched]) if (t.cardId) targets.set(`${t.cardLang}:${t.cardId}`, { id: t.cardId, lang: t.cardLang });

  const fx = await getUsdToEur();
  const results = await mapLimit([...targets.values()], 8, async ({ id, lang }) => {
    const card = await getCard(id, lang).catch(() => null);
    return card ? recordCardSnapshot(card, fx) : false;
  });

  // Cartes gradées et scellé : on relève leur cote calculée sous leur propre clé.
  const auto = held.filter((h) => h.manualPrice == null && (h.kind === "sealed" ? h.productId : h.gradingCompany && h.grade));
  const quotes = await quoteHoldings(auto);
  for (const h of auto) await recordKeySnapshot(priceKey(h), quotes.get(h.id)?.price ?? null);

  if (!userId) await setMeta("lastRefresh", todayISO());
  return { tracked: targets.size + auto.filter((h) => h.kind === "sealed").length, updated: results.filter(Boolean).length + auto.length };
}

/** Relevé automatique une fois par jour, déclenché à la première visite (pratique en local, sans cron). */
export async function refreshIfStale() {
  const today = todayISO();
  if ((await getMeta("lastRefresh")) === today) return;
  await setMeta("lastRefresh", today);
  await refreshTrackedPrices();
}

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select().from(schema.appMeta).where(eq(schema.appMeta.key, key));
  return rows[0]?.value ?? null;
}

export async function setMeta(key: string, value: string) {
  const db = await getDb();
  await db
    .insert(schema.appMeta)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.appMeta.key, set: { value } });
}
