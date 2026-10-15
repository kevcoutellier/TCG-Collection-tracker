"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { conditionValues, languageValues, sealedValues } from "@/lib/constants";
import { priceKey } from "@/lib/analysis";
import { requireUser } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { todayISO } from "@/lib/format";
import { recordCardSnapshot, recordKeySnapshot, recordManualSnapshot, refreshTrackedPrices } from "@/lib/snapshots";
import { getCard, getUsdToEur } from "@/lib/tcgdex";
import type { Lang } from "@/lib/types";
import { quoteHoldings } from "@/lib/valuation";

export type ActionState = { ok: boolean; message: string } | null;

/* ---------- Validation ---------- */

const decimal = (v: unknown) => (typeof v === "string" ? v.replace(",", ".").trim() : v);
const money = z.preprocess(decimal, z.coerce.number({ error: "Montant invalide" }).min(0, "Montant négatif").max(1e8));
const optionalMoney = z.preprocess(
  (v) => (v === "" || v == null ? undefined : decimal(v)),
  z.coerce.number({ error: "Montant invalide" }).min(0, "Montant négatif").max(1e8).optional(),
);
const quantity = z.coerce.number({ error: "Quantité invalide" }).int("Quantité entière attendue").min(1, "Quantité minimale : 1").max(100000);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => v || null);

const cardRef = {
  cardId: z.string().min(1),
  cardLang: z.enum(["fr", "en", "ja"]),
  name: z.string().trim().min(1).max(200),
  setName: optionalText(200),
  image: optionalText(500),
  rarity: optionalText(100),
  variant: z.string().trim().min(1).max(100),
  variantLabel: optionalText(120),
};

const cardHoldingSchema = z.object({
  ...cardRef,
  quantity,
  purchasePrice: money,
  purchaseDate: isoDate,
  condition: z.enum(conditionValues),
  language: z.enum(languageValues),
  gradingCompany: optionalText(40),
  grade: optionalText(20),
  manualPrice: optionalMoney,
  notes: optionalText(1000),
});

const sealedSchema = z.object({
  productId: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().positive().optional()),
  name: z.string().trim().min(2, "Nom du produit requis").max(200),
  sealedType: z.enum(sealedValues),
  setName: optionalText(200),
  image: z
    .union([z.literal(""), z.url("URL d'image invalide").max(500)])
    .optional()
    .transform((v) => v || null),
  language: z.enum(languageValues),
  quantity,
  purchasePrice: money,
  purchaseDate: isoDate,
  manualPrice: optionalMoney,
  notes: optionalText(1000),
});

const updateSchema = z.object({
  quantity,
  purchasePrice: money,
  purchaseDate: isoDate,
  manualPrice: optionalMoney,
  condition: z.enum(conditionValues).optional(),
  gradingCompany: optionalText(40),
  grade: optionalText(20),
  notes: optionalText(1000),
});

const sellSchema = z.object({
  quantity,
  salePrice: money,
  saleFees: optionalMoney,
  soldAt: isoDate,
});

const watchSchema = z.object({
  ...cardRef,
  targetPrice: optionalMoney,
  note: optionalText(500),
});

const watchUpdateSchema = z.object({ targetPrice: optionalMoney, note: optionalText(500) });

function fail(error: unknown): ActionState {
  if (error instanceof z.ZodError) return { ok: false, message: error.issues[0]?.message ?? "Données invalides" };
  console.error(error);
  return { ok: false, message: "Une erreur est survenue, réessayez." };
}

async function snapshotCard(cardId: string, lang: Lang) {
  const card = await getCard(cardId, lang).catch(() => null);
  if (card) await recordCardSnapshot(card, await getUsdToEur());
}

/** Une ligne n'est lisible et modifiable que par son propriétaire. */
const ownHolding = (id: string, userId: string) => and(eq(schema.holdings.id, id), eq(schema.holdings.userId, userId));
const ownWatch = (id: string, userId: string) => and(eq(schema.watchlist.id, id), eq(schema.watchlist.userId, userId));

type QuotedRow = Parameters<typeof quoteHoldings>[0][number] & Parameters<typeof priceKey>[0];

/** Relève immédiatement la cote automatique d'une ligne (carte gradée, scellé). */
async function snapshotQuote(row: QuotedRow) {
  const quote = (await quoteHoldings([row])).get(row.id);
  if (quote?.price != null) await recordKeySnapshot(priceKey(row), quote.price);
}

/* ---------- Collection ---------- */
// Chaque action vérifie la session avant son try/catch : la redirection vers la connexion ne doit pas être interceptée.

export async function addCardHolding(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const data = cardHoldingSchema.parse(Object.fromEntries(formData));
    const db = await getDb();
    const [row] = await db
      .insert(schema.holdings)
      .values({ kind: "card", userId: user.id, ...data, manualPrice: data.manualPrice ?? null })
      .returning({ id: schema.holdings.id });
    await snapshotCard(data.cardId, data.cardLang);
    if (data.manualPrice != null) {
      if (data.purchaseDate < todayISO()) await recordManualSnapshot(row.id, data.purchasePrice, data.purchaseDate);
      await recordManualSnapshot(row.id, data.manualPrice);
    } else if (data.gradingCompany && data.grade) {
      await snapshotQuote({ id: row.id, kind: "card", ...data, productId: null, manualPrice: null });
    }
    refresh();
    return { ok: true, message: `« ${data.name} » ajoutée à votre collection` };
  } catch (e) {
    return fail(e);
  }
}

export async function addSealedHolding(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const data = sealedSchema.parse(Object.fromEntries(formData));
    // Produit du catalogue Cardmarket : cote automatique. Sinon, valeur saisie (ou prix d'achat).
    const manualPrice = data.productId ? (data.manualPrice ?? null) : (data.manualPrice ?? data.purchasePrice);
    const db = await getDb();
    const [row] = await db
      .insert(schema.holdings)
      .values({ kind: "sealed", userId: user.id, ...data, productId: data.productId ?? null, manualPrice })
      .returning({ id: schema.holdings.id });
    if (manualPrice != null) {
      // Point de départ de l'historique : le prix payé à la date d'achat.
      if (data.purchaseDate < todayISO()) await recordManualSnapshot(row.id, data.purchasePrice, data.purchaseDate);
      await recordManualSnapshot(row.id, manualPrice);
    } else {
      await snapshotQuote({
        id: row.id,
        kind: "sealed",
        cardId: null,
        cardLang: "fr",
        variant: "normal",
        productId: data.productId,
        language: data.language,
        gradingCompany: null,
        grade: null,
        manualPrice: null,
      });
    }
    refresh();
    return { ok: true, message: `« ${data.name} » ajouté à votre collection` };
  } catch (e) {
    return fail(e);
  }
}

export async function updateHolding(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const data = updateSchema.parse(Object.fromEntries(formData));
    const db = await getDb();
    const [before] = await db.select().from(schema.holdings).where(ownHolding(id, user.id));
    if (!before) return { ok: false, message: "Ligne introuvable" };
    await db
      .update(schema.holdings)
      .set({
        ...data,
        manualPrice: data.manualPrice ?? null,
        condition: data.condition ?? before.condition,
        gradingCompany: before.kind === "card" ? data.gradingCompany : null,
        grade: before.kind === "card" ? data.grade : null,
      })
      .where(ownHolding(id, user.id));
    if (data.manualPrice != null && data.manualPrice !== before.manualPrice) {
      await recordManualSnapshot(id, data.manualPrice);
    } else if (data.manualPrice == null) {
      const after = { ...before, ...data, manualPrice: null };
      if (after.kind === "sealed" ? after.productId : after.gradingCompany && after.grade) await snapshotQuote(after);
    }
    refresh();
    return { ok: true, message: "Modifications enregistrées" };
  } catch (e) {
    return fail(e);
  }
}

export async function sellHolding(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const data = sellSchema.parse(Object.fromEntries(formData));
    const db = await getDb();
    const [h] = await db.select().from(schema.holdings).where(ownHolding(id, user.id));
    if (!h) return { ok: false, message: "Ligne introuvable" };
    if (h.soldAt) return { ok: false, message: "Cette ligne est déjà vendue" };
    if (data.quantity > h.quantity) return { ok: false, message: `Vous ne détenez que ${h.quantity} exemplaire(s)` };
    const sale = { soldAt: data.soldAt, salePrice: data.salePrice, saleFees: data.saleFees ?? 0 };

    if (data.quantity === h.quantity) {
      await db.update(schema.holdings).set(sale).where(ownHolding(id, user.id));
    } else {
      // Vente partielle : on scinde la ligne en une partie conservée et une partie vendue.
      await db.update(schema.holdings).set({ quantity: h.quantity - data.quantity }).where(ownHolding(id, user.id));
      await db
        .insert(schema.holdings)
        .values({ ...h, id: undefined, createdAt: undefined, quantity: data.quantity, ...sale });
    }
    refresh();
    return { ok: true, message: `Vente de « ${h.name} » enregistrée` };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteHolding(id: string): Promise<ActionState> {
  const user = await requireUser();
  try {
    const db = await getDb();
    const deleted = await db.delete(schema.holdings).where(ownHolding(id, user.id)).returning({ id: schema.holdings.id });
    if (!deleted.length) return { ok: false, message: "Ligne introuvable" };
    await db.delete(schema.priceSnapshots).where(eq(schema.priceSnapshots.itemKey, `manual:${id}`));
    refresh();
    return { ok: true, message: "Ligne supprimée" };
  } catch (e) {
    return fail(e);
  }
}

/* ---------- Watchlist ---------- */

export async function addToWatchlist(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const data = watchSchema.parse(Object.fromEntries(formData));
    const db = await getDb();
    const targetPrice = data.targetPrice ?? null;
    await db
      .insert(schema.watchlist)
      .values({ ...data, userId: user.id, targetPrice })
      .onConflictDoUpdate({
        target: [schema.watchlist.userId, schema.watchlist.cardId],
        set: { targetPrice, note: data.note, variant: data.variant, variantLabel: data.variantLabel },
      });
    await snapshotCard(data.cardId, data.cardLang);
    refresh();
    return { ok: true, message: `« ${data.name} » ajoutée à la watchlist` };
  } catch (e) {
    return fail(e);
  }
}

export async function updateWatch(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const data = watchUpdateSchema.parse(Object.fromEntries(formData));
    const db = await getDb();
    const updated = await db
      .update(schema.watchlist)
      .set({ targetPrice: data.targetPrice ?? null, note: data.note })
      .where(ownWatch(id, user.id))
      .returning({ id: schema.watchlist.id });
    if (!updated.length) return { ok: false, message: "Carte introuvable dans votre watchlist" };
    refresh();
    return { ok: true, message: "Objectif mis à jour" };
  } catch (e) {
    return fail(e);
  }
}

export async function removeFromWatchlist(id: string): Promise<ActionState> {
  const user = await requireUser();
  try {
    const db = await getDb();
    await db.delete(schema.watchlist).where(ownWatch(id, user.id));
    refresh();
    return { ok: true, message: "Retirée de la watchlist" };
  } catch (e) {
    return fail(e);
  }
}

/* ---------- Prix ---------- */

export async function refreshPrices(): Promise<ActionState> {
  const user = await requireUser();
  try {
    const { tracked, updated } = await refreshTrackedPrices(user.id);
    refresh();
    return {
      ok: true,
      message: tracked ? `${updated} / ${tracked} cartes relevées aujourd'hui` : "Aucune carte suivie pour l'instant",
    };
  } catch (e) {
    return fail(e);
  }
}
