import { describe, expect, it } from "vitest";
import { evaluateOpportunity, scanOpportunities } from "./opportunities";
import { toEnglishQuery } from "./pokemon-names";
import type { PriceInfo } from "./types";

const price = (p: Partial<PriceInfo>): PriceInfo => ({
  price: p.trend ?? null,
  source: "cardmarket",
  trend: null,
  avg: null,
  low: null,
  avg1: null,
  avg7: null,
  avg30: null,
  usdMarket: null,
  updated: null,
  ...p,
});

describe("evaluateOpportunity", () => {
  it("repère un rebond : décote vs 30 j et ventes du jour au-dessus de la moyenne 7 j", () => {
    const o = evaluateOpportunity("Charizard ex", price({ trend: 80, avg30: 100, avg7: 82, avg1: 85, low: 75 }));
    expect(o?.kind).toBe("rebound");
    expect(o?.vs30).toBeCloseTo(-0.2);
    expect(o?.upside).toBe(20);
    expect(o?.popularity).toBe("S");
  });

  it("classe en simple décote quand les ventes ne repartent pas encore", () => {
    const o = evaluateOpportunity("Gardevoir ex", price({ trend: 40, avg30: 50, avg7: 42, avg1: 39 }));
    expect(o?.kind).toBe("discount");
  });

  it("signale une annonce très sous la cote sur une carte stable", () => {
    const o = evaluateOpportunity("Lugia V", price({ trend: 60, avg30: 61, avg7: 60, avg1: 60, low: 30 }));
    expect(o?.kind).toBe("floor");
    expect(o?.floorRatio).toBeCloseTo(0.5);
  });

  it("ignore les cartes stables, trop bon marché ou cotées hors Cardmarket", () => {
    expect(evaluateOpportunity("Pikachu", price({ trend: 30, avg30: 30, avg7: 30, avg1: 30, low: 25 }))).toBeNull();
    expect(evaluateOpportunity("Pikachu", price({ trend: 4, avg30: 8, avg7: 5, avg1: 5 }))).toBeNull();
    expect(evaluateOpportunity("Pikachu", price({ trend: 40, avg30: 60, avg7: 45, avg1: 46, source: "tcgplayer" }))).toBeNull();
  });

  it("pénalise une baisse qui s'accélère (couteau qui tombe)", () => {
    const steady = evaluateOpportunity("Rayquaza VMAX", price({ trend: 70, avg30: 100, avg7: 72, avg1: 70 }))!;
    const falling = evaluateOpportunity("Rayquaza VMAX", price({ trend: 70, avg30: 100, avg7: 90, avg1: 70 }))!;
    expect(falling.score).toBeLessThan(steady.score);
    expect(falling.reasons.some((r) => r.includes("s'accélère"))).toBe(true);
  });

  it("préfère un Pokémon recherché à décote égale", () => {
    const popular = evaluateOpportunity("Umbreon VMAX", price({ trend: 80, avg30: 100, avg7: 80, avg1: 80 }))!;
    const other = evaluateOpportunity("Bibarel", price({ trend: 80, avg30: 100, avg7: 80, avg1: 80 }))!;
    expect(popular.score).toBeGreaterThan(other.score);
  });
});

describe("scanOpportunities", () => {
  const items = [
    { name: "Charizard ex", price: price({ trend: 80, avg30: 100, avg7: 82, avg1: 85 }) },
    { name: "Bibarel", price: price({ trend: 40, avg30: 50, avg7: 42, avg1: 39 }) },
    { name: "Umbreon VMAX", price: price({ trend: 900, avg30: 1000, avg7: 950, avg1: 960 }) },
    { name: "Pikachu", price: price({ trend: 30, avg30: 30, avg7: 30, avg1: 30 }) },
  ];

  it("trie par score décroissant et écarte les cartes sans signal", () => {
    const res = scanOpportunities(items);
    expect(res.map((r) => r.name)).not.toContain("Pikachu");
    for (let i = 1; i < res.length; i++) expect(res[i - 1].opportunity.score).toBeGreaterThanOrEqual(res[i].opportunity.score);
  });

  it("filtre par nom (français traduit), prix maximum, type et popularité", () => {
    expect(scanOpportunities(items, { query: "Dracaufeu" }).map((r) => r.name)).toEqual(["Charizard ex"]);
    expect(scanOpportunities(items, { maxPrice: 500 }).map((r) => r.name)).not.toContain("Umbreon VMAX");
    expect(scanOpportunities(items, { kind: "discount" }).map((r) => r.name)).toEqual(["Bibarel"]);
    expect(scanOpportunities(items, { popularOnly: true }).map((r) => r.name)).not.toContain("Bibarel");
  });
});

describe("toEnglishQuery", () => {
  it("traduit les noms connus et normalise accents et casse", () => {
    expect(toEnglishQuery("Dracaufeu EX")).toBe("charizard ex");
    expect(toEnglishQuery("Évoli  VMAX")).toBe("eevee vmax");
    expect(toEnglishQuery("Pikachu")).toBe("pikachu");
  });
});
