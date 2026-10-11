import { asc, desc, eq, inArray, like } from "drizzle-orm";
import { connection } from "next/server";
import {
  analyzeCard,
  buildPortfolioHistory,
  cardKey,
  portfolioInsights,
  priceKey,
  summarizePortfolio,
  valueHolding,
} from "./analysis";
import { mapLimit } from "./async";
import { getDb, schema } from "./db";
import { todayISO } from "./format";
import { cardVariants, findVariant } from "./pricing";
import { getCard, getUsdToEur } from "./tcgdex";
import { quoteHoldings } from "./valuation";

// Chargement des données utilisateur (base locale) enrichies des prix du marché.
// `connection()` exclut ces lectures du prérendu : elles s'exécutent à chaque requête.

export type HoldingRow = typeof schema.holdings.$inferSelect;
export type WatchRow = typeof schema.watchlist.$inferSelect;

export async function loadPortfolio() {
  await connection();
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.holdings)
    .orderBy(desc(schema.holdings.purchaseDate), desc(schema.holdings.createdAt));
  const open = rows.filter((r) => !r.soldAt);
  const sold = rows.filter((r) => r.soldAt);

  const quotes = await quoteHoldings(open);

  // Anciennes lignes (« normal »/« reverse ») : on enregistre la variante exacte une fois résolue.
  const legacy = open.filter((h) => {
    const q = quotes.get(h.id);
    return q?.variantKey && (q.variantKey !== h.variant || q.variantLabel !== h.variantLabel);
  });
  await Promise.all(
    legacy.map((h) => {
      const q = quotes.get(h.id)!;
      h.variant = q.variantKey!;
      h.variantLabel = q.variantLabel ?? null;
      return db
        .update(schema.holdings)
        .set({ variant: h.variant, variantLabel: h.variantLabel })
        .where(eq(schema.holdings.id, h.id));
    }),
  );

  const positions = open.map((h) => {
    const quote = quotes.get(h.id) ?? null;
    return { ...valueHolding(h, quote), marketPrice: quote?.momentumFrom ?? null };
  });
  const summary = summarizePortfolio(positions, sold);
  return { rows, positions, sold, summary, insights: portfolioInsights(positions, summary) };
}

export type PortfolioData = Awaited<ReturnType<typeof loadPortfolio>>;
export type PositionView = PortfolioData["positions"][number];

export async function loadPortfolioHistory(rows: HoldingRow[]) {
  if (!rows.length) return [];
  const db = await getDb();
  const keys = [...new Set(rows.map(priceKey))];
  const snaps = await db
    .select({ itemKey: schema.priceSnapshots.itemKey, day: schema.priceSnapshots.day, price: schema.priceSnapshots.price })
    .from(schema.priceSnapshots)
    .where(inArray(schema.priceSnapshots.itemKey, keys));
  return buildPortfolioHistory(rows, snaps, todayISO());
}

export async function loadWatchlist() {
  await connection();
  const db = await getDb();
  const rows = await db.select().from(schema.watchlist).orderBy(desc(schema.watchlist.createdAt));
  const fx = await getUsdToEur();
  const cards = await mapLimit(rows, 12, (r) => getCard(r.cardId, r.cardLang).catch(() => null));
  return rows.map((r, i) => {
    const card = cards[i];
    const variant = card ? findVariant(cardVariants(card, fx), r.variant) : null;
    const price = variant?.price ?? null;
    const analysis = price ? analyzeCard({ name: r.name, rarity: r.rarity, price }) : null;
    const distance =
      price?.price != null && r.targetPrice != null && r.targetPrice > 0 ? price.price / r.targetPrice - 1 : null;
    return {
      ...r,
      variantLabel: r.variantLabel ?? variant?.label ?? null,
      variantCount: card ? cardVariants(card, fx).length : 1,
      price,
      analysis,
      distance,
      reached: distance != null && distance <= 0,
    };
  });
}

export type WatchView = Awaited<ReturnType<typeof loadWatchlist>>[number];

/** Suivi d'une carte précise : exemplaires détenus, surveillance et historique des relevés par variante. */
export async function loadCardTracking(cardId: string) {
  await connection();
  const db = await getDb();
  const [owned, watch, snaps] = await Promise.all([
    db.select().from(schema.holdings).where(eq(schema.holdings.cardId, cardId)),
    db.select().from(schema.watchlist).where(eq(schema.watchlist.cardId, cardId)),
    db
      .select()
      .from(schema.priceSnapshots)
      .where(like(schema.priceSnapshots.itemKey, `${cardId}::%`))
      .orderBy(asc(schema.priceSnapshots.day)),
  ]);
  // Relevés de la carte brute uniquement (les clés gradées ont un segment de plus).
  const prefix = cardKey(cardId, "");
  const history = snaps
    .filter((s) => !s.itemKey.slice(prefix.length).includes("::"))
    .map((s) => ({ variant: s.itemKey.slice(prefix.length), day: s.day, price: s.price }));
  return { owned: owned.filter((h) => !h.soldAt), watch: watch[0] ?? null, history };
}
