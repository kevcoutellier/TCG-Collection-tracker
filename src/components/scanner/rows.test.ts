import { describe, expect, it } from "vitest";
import { type CardCandidate, EMPTY_READING, type ScanDetection } from "@/lib/scan-model";
import { refreshPrice, rowFromDetection, rowsToItems, withCandidate } from "./rows";

const candidate = (over: Partial<CardCandidate> = {}): CardCandidate => ({
  id: "sv03.5-199",
  lang: "fr",
  name: "Dracaufeu ex",
  setName: "151",
  localId: "199",
  total: 165,
  image: "https://assets.tcgdex.net/fr/sv/sv03.5/199",
  rarity: "Illustration spéciale rare",
  releaseDate: "2023-09-22",
  variants: [
    { key: "holo", label: "Holo", type: "holo", price: 120 },
    { key: "rev", label: "Reverse", type: "reverse", price: 150 },
  ],
  score: 0.95,
  ...over,
});

const detection = (over: Partial<ScanDetection> = {}): ScanDetection => ({
  key: "v0",
  source: "vision",
  reading: { ...EMPTY_READING, name: "Dracaufeu ex", number: "199", total: 165, language: "fr", confidence: "high" },
  candidates: [candidate()],
  ...over,
});

describe("rowFromDetection", () => {
  it("retient d'office une identification sûre, avec la cote de la variante comme prix", () => {
    const row = rowFromDetection(detection(), "p1");
    expect(row).toMatchObject({ candidateId: "sv03.5-199", include: true, variantKey: "holo", price: "120.00", language: "FR" });
  });

  it("laisse décocher une identification douteuse et sans candidate", () => {
    expect(rowFromDetection(detection({ candidates: [candidate({ score: 0.3 })] }), "p1").include).toBe(false);
    expect(rowFromDetection(detection({ candidates: [] }), "p1")).toMatchObject({ include: false, candidateId: null });
  });

  it("propose la variante reverse lue et l'estimation gradée pour un slab", () => {
    const reading = { ...EMPTY_READING, finish: "reverse" as const, grading: { company: "psa", grade: "10" }, language: "fr" as const };
    const row = rowFromDetection(detection({ reading }), "p1");
    expect(row.variantKey).toBe("rev");
    expect(row.gradingCompany).toBe("PSA");
    expect(Number(row.price)).toBeGreaterThan(150);
  });
});

describe("withCandidate / refreshPrice", () => {
  it("ne remplace pas un prix saisi par l'utilisateur", () => {
    const row = { ...rowFromDetection(detection(), "p1"), price: "80", priceTouched: true };
    expect(withCandidate(row, candidate({ id: "other" })).price).toBe("80");
    expect(refreshPrice({ ...row, variantKey: "rev" }).price).toBe("80");
    expect(refreshPrice({ ...row, priceTouched: false, variantKey: "rev" }).price).toBe("150.00");
  });
});

describe("rowsToItems", () => {
  it("ignore les lignes décochées et regroupe les doublons", () => {
    const a = rowFromDetection(detection(), "p1");
    const b = rowFromDetection(detection({ key: "v1" }), "p2");
    const c = { ...rowFromDetection(detection({ key: "v2" }), "p2"), include: false };
    const items = rowsToItems([a, b, c]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ cardId: "sv03.5-199", quantity: 2, purchasePrice: 120, variant: "holo", gradingCompany: "" });
  });

  it("garde séparés deux états différents et accepte la virgule décimale", () => {
    const a = { ...rowFromDetection(detection(), "p1"), price: "99,5", priceTouched: true };
    const b = { ...rowFromDetection(detection({ key: "v1" }), "p1"), condition: "EX" };
    const items = rowsToItems([a, b]);
    expect(items.map((i) => [i.condition, i.purchasePrice])).toEqual([
      ["NM", 99.5],
      ["EX", 120],
    ]);
  });
});
