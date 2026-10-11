import { describe, expect, it } from "vitest";
import {
  addDays,
  analyzeCard,
  breakEvenPrice,
  buildPortfolioHistory,
  type HoldingInput,
  gradedKey,
  gradingSimulation,
  momentum,
  netFromSale,
  popularityTier,
  portfolioInsights,
  priceKey,
  projectGrowth,
  rarityTier,
  sealedKey,
  summarizePortfolio,
  type UnitQuote,
  valueHolding,
  volatility,
} from "./analysis";
import type { PriceInfo } from "./types";

const price = (p: Partial<PriceInfo>): PriceInfo => ({
  price: null,
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

const market = (p: Partial<PriceInfo>): UnitQuote => ({ price: p.price ?? null, source: "market", momentumFrom: price(p) });

const holding = (h: Partial<HoldingInput> & { id: string }): HoldingInput => ({
  kind: "card",
  cardId: h.id,
  name: h.id,
  setName: "Set",
  variant: "normal",
  gradingCompany: null,
  grade: null,
  quantity: 1,
  purchasePrice: 10,
  purchaseDate: "2026-01-01",
  manualPrice: null,
  soldAt: null,
  salePrice: null,
  saleFees: null,
  ...h,
});

describe("classifications", () => {
  it("reconnaît les Pokémon populaires (FR/EN, accents ignorés)", () => {
    expect(popularityTier("Dracaufeu-ex")).toBe("S");
    expect(popularityTier("Méga-Dracaufeu X-ex")).toBe("S");
    expect(popularityTier("Évoli")).toBe("S");
    expect(popularityTier("Absol")).toBe("A");
    expect(popularityTier("Chenipan")).toBe("B");
  });

  it("classe les raretés", () => {
    expect(rarityTier("Illustration spéciale rare")).toBe("top");
    expect(rarityTier("Special illustration rare")).toBe("top");
    expect(rarityTier("Illustration rare")).toBe("high");
    expect(rarityTier("Holo Rare VSTAR")).toBe("high");
    expect(rarityTier("Double rare")).toBe("mid");
    expect(rarityTier("Peu Commune")).toBe("low");
    expect(rarityTier("Rare", "Rayquaza ☆")).toBe("top");
    expect(rarityTier(undefined)).toBe("unknown");
  });
});

describe("analyzeCard", () => {
  const now = new Date("2026-10-10");

  it("détecte un momentum haussier", () => {
    const a = analyzeCard(
      { name: "Pikachu-ex", rarity: "Illustration spéciale rare", releaseDate: "2024-11-08", price: price({ price: 335, trend: 335, avg7: 321, avg30: 273, low: 280 }) },
      now,
    );
    expect(a.signal.kind).toBe("bullish");
    expect(a.momentum.vs30).toBeCloseTo(335 / 273 - 1);
    expect(a.score).toBeGreaterThan(70);
    expect(a.breakEven).toBeCloseTo((335 + 1.5) / 0.95, 1);
  });

  it("signale une décote sur une carte de qualité, une baisse sur une carte faible", () => {
    const strong = analyzeCard(
      { name: "Noctali VMAX", rarity: "Magnifique rare", releaseDate: "2021-08-27", price: price({ price: 1500, trend: 1500, avg7: 1700, avg30: 1800, low: 1200 }) },
      now,
    );
    expect(strong.signal.kind).toBe("opportunity");
    const weak = analyzeCard({ name: "Chenipan", rarity: "Commune", price: price({ price: 0.1, trend: 0.1, avg30: 0.2, avg7: 0.15 }) }, now);
    expect(weak.signal.kind).toBe("bearish");
    expect(weak.score).toBeLessThan(40);
  });

  it("reste borné entre 0 et 100 et gère l'absence de prix", () => {
    const a = analyzeCard({ name: "Inconnu", price: price({}) }, now);
    expect(a.signal.kind).toBe("unknown");
    expect(a.score).toBeGreaterThanOrEqual(0);
    expect(a.score).toBeLessThanOrEqual(100);
    expect(a.breakEven).toBeNull();
  });

  it("calcule les variations de momentum", () => {
    expect(momentum(price({ trend: 110, avg7: 100, avg30: 100, avg1: 105 }))).toEqual({ vs30: expect.closeTo(0.1), vs7: expect.closeTo(0.1), day: expect.closeTo(0.05) });
  });
});

describe("frais et volatilité", () => {
  it("le prix d'équilibre couvre commission et envoi", () => {
    const be = breakEvenPrice(100, 0.05, 1.5);
    expect(netFromSale(be, 0.05, 1.5)).toBeCloseTo(100);
  });

  it("volatilité nulle sur une série constante, absente si trop courte", () => {
    expect(volatility([10, 10, 10, 10, 10, 10, 10])).toBe(0);
    expect(volatility([10, 11])).toBeNull();
  });
});

describe("portefeuille", () => {
  it("valorise au prix manuel en priorité, puis à la cote automatique, sinon au coût", () => {
    const quote = market({ price: 30, trend: 30, avg30: 25 });
    const manual = valueHolding(holding({ id: "a", manualPrice: 50, quantity: 2 }), quote);
    expect(manual).toMatchObject({ unitPrice: 50, priceSource: "manual", value: 100, cost: 20, pnl: 80, pnlPct: 4 });
    const live = valueHolding(holding({ id: "b" }), quote);
    expect(live).toMatchObject({ unitPrice: 30, priceSource: "market", pnl: 20 });
    const graded = valueHolding(holding({ id: "g", gradingCompany: "PSA", grade: "10" }), { price: 90, source: "estimate", momentumFrom: price({ price: 30, avg30: 25 }) });
    expect(graded).toMatchObject({ unitPrice: 90, priceSource: "estimate", category: "graded" });
    expect(graded.vs30).toBeCloseTo(0.2);
    expect(live.vs30).toBeCloseTo(0.2);
    const none = valueHolding(holding({ id: "c" }), null);
    expect(none).toMatchObject({ priceSource: "none", value: 10, pnl: null });
  });

  it("résume valeur, plus-values, concentration et répartition", () => {
    const positions = [
      valueHolding(holding({ id: "a", purchasePrice: 100 }), market({ price: 300 })),
      valueHolding(holding({ id: "b", purchasePrice: 100, kind: "sealed", cardId: null, manualPrice: 100 }), null),
    ];
    const sold = [holding({ id: "s", purchasePrice: 10, quantity: 2, soldAt: "2026-05-01", salePrice: 25, saleFees: 2 })];
    const s = summarizePortfolio(positions, sold);
    expect(s.totalValue).toBe(400);
    expect(s.totalCost).toBe(200);
    expect(s.unrealized).toBe(200);
    expect(s.realized).toBe(28);
    expect(s.topWeight).toBeCloseTo(0.75);
    expect(s.diversification).toBe(Math.round((1 - (0.75 ** 2 + 0.25 ** 2)) * 100));
    expect(s.allocation.category.map((c) => c.key)).toEqual(["single", "sealed"]);
    expect(s.best?.id).toBe("a");

    const insights = portfolioInsights(positions, s);
    expect(insights.map((i) => i.title)).toContain("Concentration élevée");
    expect(insights.map((i) => i.title)).toContain("Prises de bénéfices à envisager");
    expect(insights.map((i) => i.title)).toContain("Candidates au grading");
  });

  it("regroupe plusieurs lots d'une même carte pour la concentration", () => {
    const positions = [
      valueHolding(holding({ id: "l1", cardId: "x" }), market({ price: 10 })),
      valueHolding(holding({ id: "l2", cardId: "x" }), market({ price: 10 })),
    ];
    expect(summarizePortfolio(positions).topWeight).toBe(1);
  });
});

describe("historique", () => {
  it("dates ISO", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("valorise chaque jour au dernier relevé connu, en respectant achats et ventes", () => {
    const a = holding({ id: "a", cardId: "card-a", purchaseDate: "2026-03-01", purchasePrice: 10 });
    const b = holding({ id: "b", cardId: "card-b", purchaseDate: "2026-03-02", purchasePrice: 5, soldAt: "2026-03-04" });
    const snaps = [
      { itemKey: "card-a::normal", day: "2026-03-01", price: 12 },
      { itemKey: "card-a::normal", day: "2026-03-03", price: 15 },
      { itemKey: "card-b::normal", day: "2026-03-02", price: 6 },
    ];
    const h = buildPortfolioHistory([a, b], snaps, "2026-03-05");
    expect(h).toEqual([
      { day: "2026-03-01", value: 12, cost: 10 },
      { day: "2026-03-02", value: 18, cost: 15 },
      { day: "2026-03-03", value: 21, cost: 15 },
      { day: "2026-03-04", value: 15, cost: 10 },
      { day: "2026-03-05", value: 15, cost: 10 },
    ]);
  });

  it("choisit la clé d'historique selon la nature de la ligne", () => {
    expect(priceKey(holding({ id: "z", kind: "sealed", cardId: null }))).toBe("manual:z");
    expect(priceKey(holding({ id: "z", kind: "sealed", cardId: null, productId: 42 }))).toBe(sealedKey(42));
    expect(priceKey(holding({ id: "z", manualPrice: 5 }))).toBe("manual:z");
    expect(priceKey(holding({ id: "z", variant: "abc" }))).toBe("z::abc");
    expect(priceKey(holding({ id: "z", variant: "abc", gradingCompany: "PSA", grade: "10" }))).toBe(gradedKey("z", "abc", "PSA", "10"));
  });
});

describe("simulateurs", () => {
  it("grading : gain positif quand le 10 est bien valorisé, seuil cohérent", () => {
    const base = { rawPrice: 100, gradingCost: 25, shippingCost: 15, p10: 0.35, p9: 0.45, p8: 0.2, price9: 150, price8: 95, feeRate: 0.05 };
    const sim = gradingSimulation({ ...base, price10: 350 });
    expect(sim.expected).toBeCloseTo(0.35 * 350 + 0.45 * 150 + 0.2 * 95);
    expect(sim.gain).toBeGreaterThan(0);
    const neutral = gradingSimulation({ ...base, price10: sim.breakEven10! });
    expect(neutral.gain).toBeCloseTo(0, 1);
  });

  it("projection DCA : versements cumulés et capitalisation", () => {
    const flat = projectGrowth({ initial: 100, monthly: 10, annualRate: 0, years: 2 });
    expect(flat.at(-1)).toEqual({ year: 2, invested: 340, value: 340 });
    const growth = projectGrowth({ initial: 1000, monthly: 0, annualRate: 0.1, years: 1 });
    expect(growth.at(-1)!.value).toBeCloseTo(1100, 0);
  });
});
