import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type CatalogSerie,
  type CatalogSetEntry,
  cardKey,
  catalogIndexInfo,
  findCatalogCards,
  findCatalogSets,
  loadCatalogIndex,
  loadSetCatalog,
  saveCatalogIndex,
  saveSetCatalog,
  setsDueForRefresh,
} from "./catalog-db";
import type { ChecklistEntry, SetChecklist } from "./checklist";
import { getDb, schema } from "./db";

// Base PGlite jetable : upserts, transactions et tri de priorité exécutés pour de vrai.
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "pokefolio-catalog-"));
  process.env.PGLITE_DIR = dir;
  await getDb();
}, 60_000);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

function entry(id: string, extra: Partial<CatalogSetEntry> = {}): CatalogSetEntry {
  return { id, name: `Extension ${id}`, englishName: null, logo: null, symbol: null, releaseDate: null, official: 10, total: 12, ...extra };
}

function serie(id: string, sets: CatalogSetEntry[]): CatalogSerie {
  return { id, name: `Série ${id}`, logo: `https://assets.tcgdex.net/fr/${id}/logo`, releaseDate: "2023-03-31", sets };
}

function card(setId: string, localId: string, price: number | null = 1): ChecklistEntry {
  return {
    id: `${setId}-${localId}`,
    localId,
    name: `Carte ${localId}`,
    image: `https://assets.tcgdex.net/fr/sv/${setId}/${localId}`,
    rarity: "Commune",
    price,
    variants: [
      { key: "n", type: "normal", label: "Normale", price },
      { key: "r", type: "reverse", label: "Reverse", price: null },
    ],
  };
}

function checklist(id: string, cards: ChecklistEntry[], extra: Partial<SetChecklist["set"]> = {}): SetChecklist {
  return {
    set: { id, name: `Extension ${id}`, cardCount: { official: 10, total: 12 }, releaseDate: "2023-09-22", serie: { id: "sv", name: "Écarlate et Violet" }, ...extra },
    englishName: null,
    cards,
  };
}

describe("catalogue en base", () => {
  it("n'a pas de liste tant qu'elle n'a pas été copiée, même si une extension l'a été", async () => {
    await saveSetCatalog("fr", checklist("direct", [card("direct", "001")]));
    expect(await loadCatalogIndex("fr")).toBeNull();
    expect(await catalogIndexInfo("fr")).toBeNull();
  });

  it("restitue la liste dans l'ordre, groupée par série", async () => {
    await saveCatalogIndex("fr", [
      serie("sv", [entry("sv03.5"), entry("sv03"), entry("sv02")]),
      serie("swsh", [entry("swsh12"), entry("swsh11")]),
    ]);
    const stored = await loadCatalogIndex("fr");
    expect(stored?.indexedAt).toBeInstanceOf(Date);
    expect(stored?.series.map((s) => [s.id, s.sets.map((x) => x.id)])).toEqual([
      // L'extension ouverte par lien direct avant la liste rejoint sa série, en dernier.
      ["sv", ["sv03.5", "sv03", "sv02", "direct"]],
      ["swsh", ["swsh12", "swsh11"]],
    ]);
    expect(stored?.series[0]).toMatchObject({ name: "Série sv", logo: "https://assets.tcgdex.net/fr/sv/logo", releaseDate: "2023-03-31" });
  });

  it("note la version du calcul de la liste, 1 pour une copie antérieure aux versions", async () => {
    const db = await getDb();
    const at = "2026-10-01T04:00:00.000Z";
    await db.update(schema.appMeta).set({ value: at }).where(eq(schema.appMeta.key, "catalogIndexedAt:fr"));
    expect(await catalogIndexInfo("fr")).toEqual({ indexedAt: new Date(at), version: 1 });
    await saveCatalogIndex("fr", [serie("sv", [entry("sv03.5"), entry("sv03"), entry("sv02")]), serie("swsh", [entry("swsh12"), entry("swsh11")])], 2);
    expect((await loadCatalogIndex("fr"))?.version).toBe(2);
  });

  it("garde le nom anglais, la date de sortie et les extensions absentes d'une nouvelle liste", async () => {
    await saveCatalogIndex("ja", [serie("SV", [entry("SV2a", { englishName: "Pokémon Card 151", releaseDate: "2023-06-16" }), entry("SV2D")])]);
    // Nouvelle liste sans nom anglais (Cardmarket indisponible) et sans SV2D (erreur passagère de TCGdex).
    await saveCatalogIndex("ja", [serie("SV", [entry("SV3", { englishName: "Ruler of the Black Flame" }), entry("SV2a", { name: "ポケモンカード151" })])]);
    const sets = (await loadCatalogIndex("ja"))!.series.flatMap((s) => s.sets);
    expect(sets[0].id).toBe("SV3");
    expect(sets.map((s) => s.id).sort()).toEqual(["SV2D", "SV2a", "SV3"]);
    expect(sets.find((s) => s.id === "SV2a")).toMatchObject({ name: "ポケモンカード151", englishName: "Pokémon Card 151", releaseDate: "2023-06-16" });
  });

  it("copie puis relit les cartes d'une extension, dans l'ordre", async () => {
    await saveSetCatalog("fr", checklist("sv03.5", [card("sv03.5", "001", 0.3), card("sv03.5", "002"), card("sv03.5", "003", null)]));
    const stored = await loadSetCatalog("fr", "sv03.5");
    expect(stored?.syncedAt).toBeInstanceOf(Date);
    expect(stored?.checklist.cards.map((c) => c.localId)).toEqual(["001", "002", "003"]);
    expect(stored?.checklist.cards[0]).toEqual(card("sv03.5", "001", 0.3));
    // Série et date issues de la liste ou de la fiche de l'extension.
    expect(stored?.checklist.set).toMatchObject({ id: "sv03.5", serie: { id: "sv", name: "Série sv" }, releaseDate: "2023-09-22", cardCount: { official: 10, total: 12 } });
  });

  it("remplace les cartes à la copie suivante sans toucher au rang dans la liste", async () => {
    await saveSetCatalog("fr", checklist("sv03.5", [card("sv03.5", "002", 5), card("sv03.5", "004")]));
    const stored = await loadSetCatalog("fr", "sv03.5");
    expect(stored?.checklist.cards.map((c) => [c.localId, c.price])).toEqual([
      ["002", 5],
      ["004", 1],
    ]);
    const first = (await loadCatalogIndex("fr"))!.series[0].sets[0];
    expect(first.id).toBe("sv03.5");
    expect(first.releaseDate).toBe("2023-09-22");
  });

  it("garde un logo de secours que ni la liste suivante ni la fiche de l'extension ne donnent", async () => {
    const logo = "https://images.pokemontcg.io/base1/logo.png";
    await saveCatalogIndex("fr", [serie("base", [entry("base1", { logo, symbol: "https://assets.tcgdex.net/univ/base/base1/symbol" })])]);
    // Source de logos indisponible à la copie suivante, puis fiche TCGdex sans logo en français.
    await saveCatalogIndex("fr", [serie("base", [entry("base1")])]);
    await saveSetCatalog("fr", checklist("base1", [card("base1", "1")], { logo: undefined, symbol: undefined }));
    expect((await loadSetCatalog("fr", "base1"))?.checklist.set).toMatchObject({ logo, symbol: "https://assets.tcgdex.net/univ/base/base1/symbol" });
    const tcgdexLogo = "https://assets.tcgdex.net/fr/base/base1/logo";
    await saveSetCatalog("fr", checklist("base1", [card("base1", "1")], { logo: tcgdexLogo }));
    expect((await loadSetCatalog("fr", "base1"))?.checklist.set.logo).toBe(tcgdexLogo);
  });

  it("ignore une extension listée dont les cartes n'ont jamais été copiées", async () => {
    expect(await loadSetCatalog("fr", "sv03")).toBeNull();
    expect(await loadSetCatalog("fr", "inconnue")).toBeNull();
  });

  it("trouve les fiches courtes, catalogue international d'abord", async () => {
    await saveCatalogIndex("ja", [serie("SV", [entry("sv03", { official: 0, total: 80 }), entry("SV9", { official: 0, total: 80 })])]);
    const found = await findCatalogSets(["sv03", "SV2a", "absente"]);
    expect(found.get("sv03")).toMatchObject({ lang: "fr", official: 10, total: 12 });
    expect(found.get("SV2a")).toMatchObject({ lang: "ja", name: "ポケモンカード151" });
    expect(found.has("absente")).toBe(false);
    // Nombre officiel inconnu (0) : le total en tient lieu.
    expect(found.size).toBe(2);
    expect((await findCatalogSets(["SV9"])).get("SV9")).toMatchObject({ official: 80, total: 80 });
  });

  it("retrouve nom et visuel des cartes dans le bon catalogue", async () => {
    await saveSetCatalog("ja", checklist("sv03.5", [card("sv03.5", "002")], { name: "151 (ja)" }));
    const refs = [
      { id: "sv03.5-002", lang: "fr" as const },
      { id: "sv03.5-002", lang: "ja" as const },
      { id: "sv03.5-004", lang: "ja" as const },
    ];
    const found = await findCatalogCards(refs);
    expect(found.size).toBe(2);
    expect(found.get(cardKey(refs[0]))).toEqual({ id: "sv03.5-002", name: "Carte 002", image: "https://assets.tcgdex.net/fr/sv/sv03.5/002" });
    expect(found.has(cardKey(refs[2]))).toBe(false);
    expect((await findCatalogCards([])).size).toBe(0);
  });

  it("priorise les extensions collectionnées, puis jamais copiées, puis les plus anciennes copies", async () => {
    const db = await getDb();
    const [{ id: userId }] = await db.insert(schema.users).values({ username: "ondine", passwordHash: "x" }).returning({ id: schema.users.id });
    await db.insert(schema.collectionItems).values({ userId, cardId: "swsh11-001", cardLang: "fr", variant: "n", setId: "swsh11", quantity: 1 });
    await saveSetCatalog("fr", checklist("sv02", [card("sv02", "001")]));
    await db
      .update(schema.catalogSets)
      .set({ cardsSyncedAt: new Date("2026-01-01") })
      .where(and(eq(schema.catalogSets.lang, "fr"), eq(schema.catalogSets.id, "sv02")));

    const due = await setsDueForRefresh(new Date(Date.now() - 86_400_000));
    // swsh11 est collectionnée ; sv03 et swsh12 jamais copiées, dans l'ordre de la liste ; sv02 copiée il y a longtemps.
    // sv03.5 et direct viennent d'être copiées : pas dues.
    expect(due.filter((d) => d.lang === "fr").map((d) => d.id)).toEqual(["swsh11", "sv03", "swsh12", "sv02"]);
    expect(due[0]).toEqual({ lang: "fr", id: "swsh11" });
    expect(due.at(-1)).toEqual({ lang: "fr", id: "sv02" });
  });
});
