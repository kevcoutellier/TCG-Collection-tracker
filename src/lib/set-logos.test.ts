import { afterEach, describe, expect, it, vi } from "vitest";
import { assetFolders, comparableName, completeSetImages, type PokemonTcgSet, pokemonTcgIds, setImagesResolver } from "./set-logos";

const ptcg = (id: string, name: string): PokemonTcgSet => ({
  id,
  name,
  images: { logo: `https://images.pokemontcg.io/${id}/logo.png`, symbol: `https://images.pokemontcg.io/${id}/symbol.png` },
});

// Extraits réels de pokemon-tcg-data (sets/en.json).
const POKEMON_TCG = [
  ptcg("base1", "Base"),
  ptcg("sv3pt5", "151"),
  ptcg("swsh35", "Champion's Path"),
  ptcg("hsp", "HGSS Black Star Promos"),
  ptcg("mcd11", "McDonald's Collection 2011"),
  ptcg("pgo", "Pokémon GO"),
  ptcg("bp", "Promo"),
  ptcg("np", "Promo"),
];

const english = (id: string, name: string, logo?: string) => ({ id, name, logo, cardCount: { official: 0, total: 0 } });

describe("logos de secours", () => {
  it("convertit un ID TCGdex en ID pokemontcg.io", () => {
    expect(pokemonTcgIds("sv03.5")).toEqual(["sv3.5", "sv3pt5", "sv35"]);
    expect(pokemonTcgIds("swsh3.5")).toEqual(["swsh3.5", "swsh3pt5", "swsh35"]);
    expect(pokemonTcgIds("base1")).toEqual(["base1"]);
    expect(pokemonTcgIds("2011bw")).toEqual(["2011bw"]);
  });

  it("compare les noms sans accents ni ponctuation", () => {
    expect(comparableName("Pokémon GO")).toBe(comparableName("Pokemon GO"));
    expect(comparableName("HS—Undaunted")).toBe(comparableName("HS Undaunted"));
    expect(comparableName("Black & White")).toBe("blackandwhite");
  });

  it("préfère le logo anglais de TCGdex, puis pokemontcg.io par ID, puis par nom", () => {
    const resolve = setImagesResolver(
      [
        english("sv03.5", "151", "https://assets.tcgdex.net/en/sv/sv03.5/logo"),
        english("base1", "Base Set"),
        english("hgssp", "HGSS Black Star Promos"),
        english("2011bw", "McDonald's Collection 2011"),
        english("swsh10.5", "Pokemon GO"),
      ],
      POKEMON_TCG,
    );
    expect(resolve("sv03.5").logo).toBe("https://assets.tcgdex.net/en/sv/sv03.5/logo");
    // Pas de symbole côté TCGdex : celui de pokemontcg.io.
    expect(resolve("sv03.5").symbol).toBe("https://images.pokemontcg.io/sv3pt5/symbol.png");
    expect(resolve("base1").logo).toBe("https://images.pokemontcg.io/base1/logo.png");
    expect(resolve("swsh3.5").logo).toBe("https://images.pokemontcg.io/swsh35/logo.png");
    expect(resolve("hgssp").logo).toBe("https://images.pokemontcg.io/hsp/logo.png");
    expect(resolve("2011bw").logo).toBe("https://images.pokemontcg.io/mcd11/logo.png");
    expect(resolve("swsh10.5").logo).toBe("https://images.pokemontcg.io/pgo/logo.png");
  });

  it("ne rattache pas un nom porté par plusieurs extensions", () => {
    const resolve = setImagesResolver([english("wp", "Promo")], POKEMON_TCG);
    expect(resolve("wp")).toEqual({ logo: null, symbol: null });
    expect(setImagesResolver([], [])("inconnue")).toEqual({ logo: null, symbol: null });
  });
});

const ASSETS = "https://raw.githubusercontent.com/1niceroli/ptcg-assets/main";

/** Remplace `fetch` : réponses JSON par URL, images ptcg-assets présentes dans `assets`, le reste en 404. */
function stubFetch(json: Record<string, unknown>, assets: string[]) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url in json) return Response.json(json[url]);
    return new Response(null, { status: assets.some((a) => url === `${ASSETS}/${a}`) ? 200 : 404 });
  });
  return calls;
}

describe("complément des images manquantes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("devine les dossiers ptcg-assets", () => {
    expect(assetFolders("SV2a", "ja")).toEqual(["ja_sv2a"]);
    expect(assetFolders("me06", "fr")).toEqual(["me6"]);
  });

  it("japonais : vérifie ptcg-assets, et n'y cherche le symbole que si l'extension y a un logo", async () => {
    const calls = stubFetch({}, ["ja_sv2a/logo.png", "ja_sv2a/symbol.png"]);
    const s12a = { id: "S12a", logo: "https://assets.tcgdex.net/ja/S/S12a/logo", symbol: "https://assets.tcgdex.net/univ/S/S12a/symbol" };
    const sets = await completeSetImages("ja", [{ id: "SV2a", logo: null, symbol: null }, { id: "SV9", logo: null, symbol: null }, s12a]);
    expect(sets).toEqual([
      { id: "SV2a", logo: `${ASSETS}/ja_sv2a/logo.png`, symbol: `${ASSETS}/ja_sv2a/symbol.png` },
      { id: "SV9", logo: null, symbol: null },
      s12a,
    ]);
    expect(calls.sort()).toEqual([`HEAD ${ASSETS}/ja_sv2a/logo.png`, `HEAD ${ASSETS}/ja_sv2a/symbol.png`, `HEAD ${ASSETS}/ja_sv9/logo.png`]);
  });

  it("international : TCGdex en anglais, puis pokemontcg.io, puis ptcg-assets", async () => {
    stubFetch(
      {
        "https://api.tcgdex.net/v2/en/sets": [
          { id: "sv03.5", name: "151", logo: "https://assets.tcgdex.net/en/sv/sv03.5/logo", cardCount: { official: 165, total: 207 } },
        ],
        "https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/sets/en.json": [ptcg("base1", "Base")],
      },
      ["me6/logo.png", "me6/symbol.png"],
    );
    const sets = await completeSetImages("fr", [
      { id: "sv03.5", logo: null, symbol: "https://assets.tcgdex.net/univ/sv/sv03.5/symbol" },
      { id: "base1", logo: null, symbol: null },
      { id: "me06", logo: null, symbol: null },
    ]);
    expect(sets.map((s) => s.logo)).toEqual([
      "https://assets.tcgdex.net/en/sv/sv03.5/logo",
      "https://images.pokemontcg.io/base1/logo.png",
      `${ASSETS}/me6/logo.png`,
    ]);
    expect(sets[2].symbol).toBe(`${ASSETS}/me6/symbol.png`);
  });

  it("garde la liste telle quelle si les sources sont injoignables", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("réseau coupé");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await completeSetImages("fr", [{ id: "base1", logo: null, symbol: null }])).toEqual([{ id: "base1", logo: null, symbol: null }]);
  });
});
