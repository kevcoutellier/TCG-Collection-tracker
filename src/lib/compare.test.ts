import { describe, expect, it } from "vitest";
import { addCompareRef, compareHref, formatCompareIds, parseCompareIds } from "./compare";

describe("parseCompareIds", () => {
  it("lit les identifiants, avec langue facultative", () => {
    expect(parseCompareIds("sv03.5-199,en:base1-4, ja:SV2a-201")).toEqual([
      { id: "sv03.5-199", lang: "fr" },
      { id: "base1-4", lang: "en" },
      { id: "SV2a-201", lang: "ja" },
    ]);
  });

  it("ignore les doublons, les valeurs invalides et l'excédent", () => {
    expect(parseCompareIds("a-1,a-1,../x,<b>,b-2,c-3,d-4,e-5").map((r) => r.id)).toEqual(["a-1", "b-2", "c-3", "d-4"]);
    expect(parseCompareIds(undefined)).toEqual([]);
  });
});

describe("formatCompareIds / compareHref", () => {
  it("fait l'aller-retour avec parseCompareIds", () => {
    const refs = parseCompareIds("sv03.5-199,en:base1-4");
    expect(formatCompareIds(refs)).toBe("sv03.5-199,en:base1-4");
    expect(compareHref(refs)).toBe("/comparateur?ids=sv03.5-199,en:base1-4");
    expect(compareHref([])).toBe("/comparateur?ids=");
  });
});

describe("addCompareRef", () => {
  it("ajoute en fin, sans doublon, et fait sortir la plus ancienne au-delà de 4", () => {
    const refs = parseCompareIds("a-1,b-2,c-3,d-4");
    expect(addCompareRef(refs, { id: "b-2", lang: "fr" }).map((r) => r.id)).toEqual(["a-1", "c-3", "d-4", "b-2"]);
    expect(addCompareRef(refs, { id: "e-5", lang: "fr" }).map((r) => r.id)).toEqual(["b-2", "c-3", "d-4", "e-5"]);
  });
});
