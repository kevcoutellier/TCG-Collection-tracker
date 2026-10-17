import { describe, expect, it } from "vitest";
import {
  type ChecklistCard,
  type CollectionItem,
  collectionTotals,
  countOfficial,
  isOfficial,
  localIdFromCardId,
  ownedByVariant,
  resolveVariantKey,
  setIdFromCardId,
  setProgress,
} from "./collection";

const normal = (price: number | null = 1) => ({ key: "normal", type: "normal", price });
const reverse = (price: number | null = 2) => ({ key: "reverse", type: "reverse", price });

function card(localId: string, variants = [normal(), reverse()], price: number | null = variants[0]?.price ?? null): ChecklistCard {
  return { id: `sv03.5-${localId}`, localId, variants, price };
}

function item(localId: string, variant = "normal", quantity = 1, lang: CollectionItem["lang"] = "fr"): CollectionItem {
  return { cardId: `sv03.5-${localId}`, lang, setId: "sv03.5", variant, quantity };
}

describe("identifiants", () => {
  it("extrait l'extension d'un ID TCGdex, points compris", () => {
    expect(setIdFromCardId("sv03.5-006")).toBe("sv03.5");
    expect(setIdFromCardId("swsh12.5-GG01")).toBe("swsh12.5");
    expect(setIdFromCardId("base1")).toBe("base1");
    expect(localIdFromCardId("swsh12.5-GG01")).toBe("GG01");
  });
});

describe("cartes officielles et secrètes", () => {
  it("les numéros au-delà du nombre officiel sont des secrètes", () => {
    expect(isOfficial({ localId: "165" }, 165, 207)).toBe(true);
    expect(isOfficial({ localId: "166" }, 165, 207)).toBe(false);
  });

  it("les sous-séries non numérotées sont hors set, sauf dans une extension sans secrètes", () => {
    expect(isOfficial({ localId: "TG05" }, 196, 246)).toBe(false);
    expect(isOfficial({ localId: "SWSH001" }, 307, 307)).toBe(true);
  });

  it("compte les cartes officielles possédées à partir des seuls ID", () => {
    expect(countOfficial(["sv03.5-006", "sv03.5-165", "sv03.5-199"], 165, 207)).toBe(2);
  });
});

describe("variantes possédées", () => {
  it("rattache les anciennes clés « normal » / « reverse » aux variantes du catalogue", () => {
    const c = card("004", [
      { key: "fr-normal-1", type: "normal", price: 0.6 },
      { key: "fr-reverse-1", type: "reverse", price: 1.2 },
    ]);
    expect(resolveVariantKey(c, "fr-reverse-1")).toBe("fr-reverse-1");
    expect(resolveVariantKey(c, "normal")).toBe("fr-normal-1");
    expect(resolveVariantKey(c, "reverse")).toBe("fr-reverse-1");
    expect(resolveVariantKey(c, "inconnue")).toBeNull();
  });

  it("additionne les langues et ignore les lignes à zéro", () => {
    const owned = ownedByVariant(card("004"), [item("004", "normal", 2), item("004", "normal", 1, "en"), item("004", "reverse", 0)]);
    expect([...owned]).toEqual([["normal", 3]]);
  });

  it("une carte sans variantes connues accepte n'importe quelle clé", () => {
    expect(resolveVariantKey(card("001", []), "holo")).toBe("holo");
  });
});

describe("avancement d'une extension", () => {
  const cards = [card("001"), card("002"), card("003", [normal(4.5)]), card("004", [normal(null), reverse(null)]), card("005", [normal(30)])];

  it("compte les cartes officielles, le master set et le coût des manquantes", () => {
    const p = setProgress(cards, [item("001"), item("001", "reverse"), item("002", "reverse", 3), item("005")], 4);
    expect(p).toEqual({
      owned: 2,
      official: 4,
      ownedAll: 3,
      total: 5,
      masterOwned: 4,
      masterTotal: 8,
      missing: 2,
      missingCost: 4.5,
    });
  });

  it("ignore les lignes d'autres extensions et ne chiffre pas des manquantes sans cote", () => {
    const other: CollectionItem = { cardId: "sv01-001", lang: "fr", setId: "sv01", variant: "normal", quantity: 1 };
    const p = setProgress([card("004", [normal(null)])], [other], 1);
    expect(p.owned).toBe(0);
    expect(p.missing).toBe(1);
    expect(p.missingCost).toBeNull();
  });
});

describe("totaux de la collection", () => {
  it("distingue exemplaires, cartes uniques et doubles", () => {
    const t = collectionTotals([item("001", "normal", 3), item("001", "reverse"), item("002", "normal", 0), item("006", "normal", 2, "en")]);
    expect(t).toEqual({ copies: 6, unique: 2, doubles: 3, sets: 1 });
  });
});
