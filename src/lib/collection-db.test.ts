import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { importHoldingsOnce, loadSetItems, ownedCardIdsBySet, setItemQuantity } from "./collection-db";
import { getDb, schema } from "./db";

// Base PGlite jetable : le SQL de reprise et d'upsert est exécuté pour de vrai.
let dir: string;
let userId: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "pokefolio-test-"));
  process.env.PGLITE_DIR = dir;
  const db = await getDb();
  [{ id: userId }] = await db.insert(schema.users).values({ username: "sacha", passwordHash: "x" }).returning({ id: schema.users.id });
  const holding = { userId, kind: "card" as const, cardLang: "fr" as const, name: "Carte", purchasePrice: 1, purchaseDate: "2026-01-01" };
  await db.insert(schema.holdings).values([
    { ...holding, cardId: "sv03.5-006", variant: "normal", quantity: 1 },
    { ...holding, cardId: "sv03.5-006", variant: "normal", quantity: 2 },
    { ...holding, cardId: "sv03.5-004", variant: "reverse", quantity: 1 },
    { ...holding, cardId: "sv03.5-007", variant: "normal", quantity: 1, soldAt: "2026-02-01", salePrice: 3 },
    { ...holding, cardId: null, kind: "sealed" as const, quantity: 1 },
  ]);
}, 60_000);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("collection en base", () => {
  it("reprend une fois les cartes encore détenues du portefeuille", async () => {
    await importHoldingsOnce(userId);
    const items = await loadSetItems(userId, "sv03.5");
    expect(items.sort((a, b) => a.cardId.localeCompare(b.cardId))).toEqual([
      { cardId: "sv03.5-004", lang: "fr", setId: "sv03.5", variant: "reverse", quantity: 1 },
      { cardId: "sv03.5-006", lang: "fr", setId: "sv03.5", variant: "normal", quantity: 3 },
    ]);
  });

  it("fixe, met à jour puis supprime une ligne", async () => {
    const item = { cardId: "sv03.5-001", lang: "fr" as const, setId: "sv03.5", variant: "normal", quantity: 1 };
    await setItemQuantity(userId, item);
    await setItemQuantity(userId, { ...item, quantity: 4 });
    expect((await loadSetItems(userId, "sv03.5")).find((i) => i.cardId === item.cardId)?.quantity).toBe(4);

    await setItemQuantity(userId, { ...item, quantity: 0 });
    expect((await loadSetItems(userId, "sv03.5")).some((i) => i.cardId === item.cardId)).toBe(false);
  });

  it("une carte retirée après la reprise ne revient pas", async () => {
    await setItemQuantity(userId, { cardId: "sv03.5-004", lang: "fr", setId: "sv03.5", variant: "reverse", quantity: 0 });
    // Un autre processus (nouvelle instance serverless) retente la reprise : le verrou en base l'en empêche.
    vi.resetModules();
    const fresh = await import("./collection-db");
    await fresh.importHoldingsOnce(userId);
    expect((await loadSetItems(userId, "sv03.5")).map((i) => i.cardId)).toEqual(["sv03.5-006"]);
  });

  it("compte les cartes différentes par extension", async () => {
    await setItemQuantity(userId, { cardId: "sv03.5-006", lang: "fr", setId: "sv03.5", variant: "reverse", quantity: 1 });
    await setItemQuantity(userId, { cardId: "sv01-001", lang: "fr", setId: "sv01", variant: "normal", quantity: 1 });
    expect(Object.fromEntries(await ownedCardIdsBySet(userId))).toEqual({ "sv03.5": ["sv03.5-006"], sv01: ["sv01-001"] });
  });
});
