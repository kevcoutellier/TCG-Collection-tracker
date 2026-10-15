import { describe, expect, it } from "vitest";
import { productPath } from "./cardmarket";
import { cardmarketProductLink, cardmarketSlug } from "./cardmarket-link";

describe("cardmarketSlug", () => {
  it("reproduit les adresses du site", () => {
    // Adresses relevées sur cardmarket.com.
    expect(cardmarketSlug("Prismatic Evolutions Elite Trainer Box")).toBe("Prismatic-Evolutions-Elite-Trainer-Box");
    expect(cardmarketSlug("Pokémon GO Elite Trainer Box")).toBe("Pokemon-GO-Elite-Trainer-Box");
    expect(cardmarketSlug("Prismatic Evolutions: Pokémon Day 2025 Eevee 2-Pack Blister")).toBe(
      "Prismatic-Evolutions-Pokemon-Day-2025-Eevee-2-Pack-Blister",
    );
    expect(cardmarketSlug("Sword & Shield Ultra-Premium Collection - Charizard")).toBe("Sword-Shield-Ultra-Premium-Collection-Charizard");
    expect(cardmarketSlug("Surging Sparks Booster Box (18 Boosters)")).toBe("Surging-Sparks-Booster-Box-18-Boosters");
  });

  it("renonce quand la conversion est incertaine", () => {
    expect(cardmarketSlug("Champion's Path Elite Trainer Box")).toBeNull();
    expect(cardmarketSlug("Pikachu / Eevee Box")).toBeNull();
    expect(cardmarketSlug("  ")).toBeNull();
  });
});

describe("productPath", () => {
  it("assemble rubrique et nom", () => {
    expect(productPath("Elite-Trainer-Boxes", "151 Elite Trainer Box")).toBe("Elite-Trainer-Boxes/151-Elite-Trainer-Box");
  });

  it("écarte les rubriques inconnues et les homonymes", () => {
    expect(productPath(undefined, "151 Elite Trainer Box")).toBeNull();
    expect(productPath("Tins", "Pikachu Tin", 2)).toBeNull();
  });
});

describe("cardmarketProductLink", () => {
  const etb = { name: "151 Elite Trainer Box", path: "Elite-Trainer-Boxes/151-Elite-Trainer-Box" };

  it("filtre la page produit sur la langue de l'exemplaire", () => {
    expect(cardmarketProductLink(etb, "FR")).toEqual({
      url: "https://www.cardmarket.com/fr/Pokemon/Products/Elite-Trainer-Boxes/151-Elite-Trainer-Box?language=2",
      language: "FR",
    });
    expect(cardmarketProductLink(etb, "JP").url).toMatch(/\?language=7$/);
  });

  it("ne filtre pas une langue inconnue de Cardmarket", () => {
    expect(cardmarketProductLink(etb, "OTHER")).toEqual({
      url: "https://www.cardmarket.com/fr/Pokemon/Products/Elite-Trainer-Boxes/151-Elite-Trainer-Box",
      language: null,
    });
  });

  it("passe par la recherche sans chemin connu", () => {
    expect(cardmarketProductLink({ name: "Champion's Path Elite Trainer Box", path: null }, "FR")).toEqual({
      url: "https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=Champion's%20Path%20Elite%20Trainer%20Box",
      language: null,
    });
  });
});
