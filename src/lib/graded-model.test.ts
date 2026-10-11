import { describe, expect, it } from "vitest";
import { expansionLabel } from "./cardmarket";
import { estimateGradedPrice, GRADING_COMPANIES, GRADING_SCALES, gradeQuote, parseSalesByGrade } from "./graded-model";

describe("estimation des cartes gradées", () => {
  it("la cote croît avec la note sur chaque échelle", () => {
    for (const company of GRADING_COMPANIES) {
      const prices = [...GRADING_SCALES[company]].reverse().map((g) => estimateGradedPrice(200, company, g, 3)!);
      for (let i = 1; i < prices.length; i++) expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
    }
  });

  it("PSA 10 moderne ≈ 2-3× la carte brute, vintage bien plus", () => {
    const modern = estimateGradedPrice(100, "PSA", "10", 2)!;
    expect(modern / 100).toBeGreaterThan(2);
    expect(modern / 100).toBeLessThan(3);
    expect(estimateGradedPrice(100, "PSA", "10", 26)!).toBeGreaterThan(modern * 3);
  });

  it("hiérarchie des sociétés pour un 10", () => {
    const at = (c: string, g = "10") => estimateGradedPrice(300, c, g, 3)!;
    expect(at("BGS", "10 Black Label")).toBeGreaterThan(at("PSA"));
    expect(at("PSA")).toBeGreaterThan(at("CGC"));
    expect(at("CGC")).toBeGreaterThan(at("PCA"));
    expect(at("PSA", "9")).toBeLessThan(at("PSA"));
  });

  it("applique un plancher pour les cartes peu chères et ignore une cote inconnue", () => {
    expect(estimateGradedPrice(0.5, "PSA", "10", 1)).toBe(25);
    expect(estimateGradedPrice(null, "PSA", "10", 1)).toBeNull();
  });
});

describe("ventes réelles", () => {
  const sales = parseSalesByGrade(
    {
      psa10: { count: 84, medianPrice: 186.75, averagePrice: 307.75, lastSaleDate: "2026-07-17T00:00:00Z" },
      cgc9_5: { smartMarketPrice: { price: 100, confidence: "low" } },
      bgs10: { averagePrice: 0 },
      foo: { medianPrice: 3 },
    },
    0.9,
  );

  it("convertit les clés et les montants en euros", () => {
    expect(sales).toEqual({
      "PSA 10": { price: 168.08, count: 84, lastSale: "2026-07-17T00:00:00Z" },
      "CGC 9.5": { price: 90, count: null, lastSale: null },
    });
  });

  it("préfère les ventes réelles à l'estimation", () => {
    expect(gradeQuote("PSA", "10", 50, 2, sales)).toMatchObject({ price: 168.08, source: "sales", count: 84 });
    expect(gradeQuote("PSA", "9", 50, 2, sales).source).toBe("estimate");
  });
});

describe("noms d'extension Cardmarket", () => {
  it("se déduisent des noms de produits", () => {
    expect(expansionLabel(["Prismatic Evolutions Booster Bundle", "Prismatic Evolutions Booster", "Prismatic Evolutions: Glaceon Tech Sticker Collection"])).toBe(
      "Prismatic Evolutions",
    );
    expect(expansionLabel(["Terastal Festival ex Booster Box", "Terastal Festival ex Booster Box Case"])).toBe("Terastal Festival ex");
    expect(expansionLabel(["MEGA Starter Set Eevee ex", "MEGA Starter Set: Eevee Coin"])).toBe("MEGA Starter Set Eevee");
  });
});
