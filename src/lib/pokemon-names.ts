// Noms français → anglais des Pokémon les plus échangés : les catalogues Cardmarket et eBay
// internationaux sont en anglais, alors que l'on tape volontiers « Dracaufeu ».

export const POKEMON_FR_EN: Record<string, string> = {
  dracaufeu: "charizard",
  salameche: "charmander",
  reptincel: "charmeleon",
  noctali: "umbreon",
  evoli: "eevee",
  mentali: "espeon",
  pyroli: "flareon",
  aquali: "vaporeon",
  voltali: "jolteon",
  phyllali: "leafeon",
  givrali: "glaceon",
  nymphali: "sylveon",
  tortank: "blastoise",
  carapuce: "squirtle",
  florizarre: "venusaur",
  bulbizarre: "bulbasaur",
  ectoplasma: "gengar",
  amphinobi: "greninja",
  dracolosse: "dragonite",
  ronflex: "snorlax",
  leviator: "gyarados",
  magicarpe: "magikarp",
  lokhlass: "lapras",
  psykokwak: "psyduck",
  tyranocif: "tyranitar",
  metamorph: "ditto",
  rondoudou: "jigglypuff",
  carchacrok: "garchomp",
  gallame: "gallade",
  mimiqui: "mimikyu",
};

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Traduit les noms de Pokémon connus d'une recherche (« Dracaufeu ex » → « charizard ex »). */
export function toEnglishQuery(query: string): string {
  return normalize(query)
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => POKEMON_FR_EN[w] ?? w)
    .join(" ");
}
