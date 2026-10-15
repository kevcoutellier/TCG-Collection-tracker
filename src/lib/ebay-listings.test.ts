import { describe, expect, it } from "vitest";
import { ebaySearchUrl, frenchSealedSearch, type Listing, summarizeListings } from "./ebay-listings";

describe("frenchSealedSearch", () => {
  it("recherche en français à partir du type de produit", () => {
    expect(frenchSealedSearch("Prismatic Evolutions Elite Trainer Box", "Évolutions Prismatiques")).toEqual({
      query: "Évolutions Prismatiques (etb, elite, élite)",
      kind: "etb",
      pokemonCenter: false,
    });
    expect(frenchSealedSearch("Surging Sparks Booster Box", "Étincelles Déferlantes")?.query).toBe("Étincelles Déferlantes display");
    expect(frenchSealedSearch("Surging Sparks Booster Bundle", "Étincelles Déferlantes")?.kind).toBe("bundle");
    expect(frenchSealedSearch("Surging Sparks Sleeved Booster", "Étincelles Déferlantes")?.kind).toBe("booster");
  });

  it("retire les mots que les vendeurs omettent du nom d'extension", () => {
    expect(frenchSealedSearch("Scarlet & Violet Elite Trainer Box", "Écarlate et Violet")?.query).toBe("Écarlate Violet (etb, elite, élite)");
  });

  it("repère les versions Pokémon Center", () => {
    expect(frenchSealedSearch("Prismatic Evolutions Pokémon Center Elite Trainer Box", "Évolutions Prismatiques")).toEqual({
      query: "Évolutions Prismatiques (etb, elite, élite) center",
      kind: "etb",
      pokemonCenter: true,
    });
    expect(frenchSealedSearch("Surging Sparks Booster Bundle Pokémon Center Version", "Étincelles Déferlantes")?.kind).toBe("bundle");
  });

  it("renonce aux lots, aux types inconnus et sans extension française", () => {
    expect(frenchSealedSearch("Surging Sparks 6 Booster Box Case", "Étincelles Déferlantes")).toBeNull();
    expect(frenchSealedSearch("Surging Sparks Booster Box (18 Boosters)", "Étincelles Déferlantes")).toBeNull();
    expect(frenchSealedSearch("Prismatic Evolutions Booster Bundle Display", "Évolutions Prismatiques")).toBeNull();
    expect(frenchSealedSearch("Prismatic Evolutions: Mini Tin Display", "Évolutions Prismatiques")).toBeNull();
    expect(frenchSealedSearch("Prismatic Evolutions Elite Trainer Box", null)).toBeNull();
  });
});

describe("summarizeListings", () => {
  const etb = { kind: "etb" as const, pokemonCenter: false, reference: 130 };
  const listing = (title: string, price: number): Listing => ({ title, price });

  it("prend la médiane des annonces du produit", () => {
    const summary = summarizeListings(
      [
        listing("Coffret Dresseur d'Élite Évolutions Prismatiques ETB FR Neuf Scellé", 189.9),
        listing("ETB Évolutions Prismatiques Pokémon FR scellé", 199),
        listing("Pokemon ETB Evolutions Prismatiques VF neuf", 210),
        listing("Coffret Dresseur d'Elite Evolutions Prismatiques jamais ouvert", 179),
      ],
      etb,
    );
    expect(summary).toEqual({ price: 194.45, low: 179, count: 4 });
  });

  it("écarte boîtes vides, lots, autres langues, versions Pokémon Center et prix aberrants", () => {
    const summary = summarizeListings(
      [
        listing("ETB Évolutions Prismatiques FR", 190),
        listing("ETB Évolutions Prismatiques FR", 200),
        listing("ETB Évolutions Prismatiques FR", 210),
        listing("Boîte vide ETB Évolutions Prismatiques", 25),
        listing("Lot de 2 ETB Évolutions Prismatiques", 390),
        listing("ETB Évolutions Prismatiques x2", 380),
        listing("ETB Prismatic Evolutions anglais", 120),
        listing("ETB Évolutions Prismatiques Japonaise", 90),
        listing("ETB Évolutions Prismatiques Pokémon Center", 320),
        listing("Carte promo ETB Évolutions Prismatiques", 15),
        listing("Display Évolutions Prismatiques + ETB", 260),
        listing("ETB Évolutions Prismatiques FR", 900),
      ],
      etb,
    );
    expect(summary).toEqual({ price: 200, low: 190, count: 3 });
  });

  it("ne garde que les versions Pokémon Center pour un produit Pokémon Center", () => {
    const summary = summarizeListings(
      [
        listing("ETB Pokémon Center Évolutions Prismatiques FR", 300),
        listing("ETB Pokemon Center Evolutions Prismatiques", 320),
        listing("ETB PC Évolutions Prismatiques", 310),
        listing("ETB Évolutions Prismatiques FR", 200),
      ],
      { ...etb, pokemonCenter: true, reference: 250 },
    );
    expect(summary).toEqual({ price: 310, low: 300, count: 3 });
  });

  it("renonce avec moins de trois annonces", () => {
    expect(summarizeListings([listing("ETB Évolutions Prismatiques FR", 190), listing("ETB Évolutions Prismatiques", 200)], etb)).toBeNull();
  });
});

describe("ebaySearchUrl", () => {
  it("cherche les annonces neuves en France, ou les ventes conclues", () => {
    const current = new URL(ebaySearchUrl("Évolutions Prismatiques (etb, elite, élite)"));
    expect(current.origin + current.pathname).toBe("https://www.ebay.fr/sch/i.html");
    expect(current.searchParams.get("_nkw")).toBe("Évolutions Prismatiques (etb, elite, élite)");
    expect(current.searchParams.get("LH_BIN")).toBe("1");
    const sold = new URL(ebaySearchUrl("Évolutions Prismatiques (etb, elite, élite)", { sold: true }));
    expect(sold.searchParams.get("LH_Sold")).toBe("1");
    expect(sold.searchParams.get("LH_Complete")).toBe("1");
    expect(sold.searchParams.has("LH_BIN")).toBe(false);
  });
});
