import { describe, expect, it } from "vitest";
import {
  bestTextSimilarity,
  type CandidateVariant,
  candidateScore,
  extractCardNumbers,
  nameSimilarity,
  normalizeNumber,
  ocrWords,
  pickVariantKey,
} from "./scan-model";

describe("normalizeNumber", () => {
  it("retire espaces et zéros de tête", () => {
    expect(normalizeNumber("025")).toBe("25");
    expect(normalizeNumber("TG05")).toBe("TG5");
    expect(normalizeNumber("svp 085")).toBe("SVP85");
    expect(normalizeNumber("100")).toBe("100");
    expect(normalizeNumber("0")).toBe("0");
  });
});

describe("extractCardNumbers", () => {
  it("trouve les numéros de collection, sans doublon", () => {
    const text = "Dracaufeu-ex PV 330\nIllus. 5ban Graphics 199/165 ★\n...199/165\nPikachu 025 / 165";
    expect(extractCardNumbers(text)).toEqual([
      { number: "199", total: 165 },
      { number: "025", total: 165 },
    ]);
  });

  it("corrige les confusions de l'OCR autour de la barre oblique", () => {
    expect(extractCardNumbers("Mew l5I/O65")).toEqual([{ number: "151", total: 65 }]);
    expect(extractCardNumbers("Mew 15l/165")).toEqual([{ number: "151", total: 165 }]);
    expect(extractCardNumbers("Evoli 1O8/131")).toEqual([{ number: "108", total: 131 }]);
  });

  it("ignore ce qui n'est pas un numéro de carte", () => {
    expect(extractCardNumbers("ISO/IEC, 1/2 dose, w/o")).toEqual([]);
  });
});

describe("nameSimilarity / bestTextSimilarity", () => {
  it("tolère accents, casse et fautes de lecture", () => {
    expect(nameSimilarity("Évoli", "evoli")).toBe(1);
    expect(nameSimilarity("Dracaufeu-ex", "Dracaufeu ex")).toBe(1);
    expect(nameSimilarity("Dracaufeu ex", "Dracaufcu ex")).toBeGreaterThan(0.7);
    expect(nameSimilarity("Dracaufeu ex", "Pikachu")).toBeLessThan(0.2);
  });

  it("retrouve un nom dans les mots d'un texte OCR", () => {
    const words = ocrWords("PV 330 Dracaufeu ex Teracristal Illus. 5ban Graphics");
    expect(bestTextSimilarity("Dracaufeu ex", words)).toBeGreaterThan(0.9);
    expect(bestTextSimilarity("Tortank ex", words)).toBeLessThan(0.5);
  });
});

describe("candidateScore", () => {
  const card = { name: "Dracaufeu ex", localId: "199", total: 165, setName: "151" };

  it("donne un score maximal quand tout concorde", () => {
    expect(candidateScore(card, { name: "Dracaufeu ex", number: "199", total: 165, setName: "151" })).toBe(1);
  });

  it("le numéro et le total départagent deux cartes du même nom", () => {
    const right = candidateScore(card, { name: "Dracaufeu ex", number: "199", total: 165, setName: null });
    const wrong = candidateScore({ ...card, localId: "006" }, { name: "Dracaufeu ex", number: "199", total: 165, setName: null });
    expect(right).toBeGreaterThan(wrong);
  });

  it("sans nom lu, s'appuie sur le texte OCR", () => {
    const words = ocrWords("Dracaufeu ex PV 330");
    const reading = { name: null, number: "199", total: 165, setName: null };
    const right = candidateScore(card, reading, words);
    // Même numéro et même total dans une autre extension : seul le texte lu les départage.
    const other = candidateScore({ ...card, name: "Mew ex", setName: "Autre" }, reading, words);
    expect(right).toBeGreaterThan(0.9);
    expect(right - other).toBeGreaterThan(0.25);
  });
});

describe("pickVariantKey", () => {
  const variants: CandidateVariant[] = [
    { key: "n", label: "Normale", type: "normal", price: 2 },
    { key: "r", label: "Reverse", type: "reverse", price: 3 },
    { key: "rp", label: "Reverse · Poké Ball", type: "reverse", price: 9 },
    { key: "h1", label: "Holo · 1re édition", type: "holo", price: 400 },
    { key: "h", label: "Holo · Illimitée", type: "holo", price: 90 },
  ];

  it("suit la finition et la mention 1re édition lues", () => {
    expect(pickVariantKey(variants, { finish: "reverse", firstEdition: false })).toBe("r");
    expect(pickVariantKey(variants, { finish: "holo", firstEdition: true })).toBe("h1");
    expect(pickVariantKey(variants, { finish: "holo", firstEdition: false })).toBe("h");
    expect(pickVariantKey(variants, { finish: "unknown", firstEdition: false })).toBe("n");
    expect(pickVariantKey([], { finish: "unknown", firstEdition: false })).toBeNull();
  });
});
