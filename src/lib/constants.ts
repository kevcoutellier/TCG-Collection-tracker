// Listes de valeurs partagées entre formulaires (client) et validation (serveur).

export const CONDITIONS = [
  { value: "MT", label: "Mint (MT)" },
  { value: "NM", label: "Near Mint (NM)" },
  { value: "EX", label: "Excellent (EX)" },
  { value: "GD", label: "Good (GD)" },
  { value: "LP", label: "Light Played (LP)" },
  { value: "PL", label: "Played (PL)" },
  { value: "PO", label: "Poor (PO)" },
] as const;

export const LANGUAGES = [
  { value: "FR", label: "Français" },
  { value: "EN", label: "Anglais" },
  { value: "JP", label: "Japonais" },
  { value: "DE", label: "Allemand" },
  { value: "IT", label: "Italien" },
  { value: "ES", label: "Espagnol" },
  { value: "OTHER", label: "Autre" },
] as const;


export const SEALED_TYPES = [
  { value: "display", label: "Display (36 boosters)" },
  { value: "etb", label: "Coffret Dresseur d'Élite (ETB)" },
  { value: "coffret", label: "Coffret / Collection" },
  { value: "upc", label: "Ultra Premium Collection" },
  { value: "tripack", label: "Tripack / Blister" },
  { value: "tin", label: "Pokébox / Tin" },
  { value: "deck", label: "Deck / Kit" },
  { value: "booster", label: "Booster à l'unité" },
  { value: "bundle", label: "Bundle / Lot de boosters" },
  { value: "other", label: "Autre" },
] as const;

export const conditionValues = CONDITIONS.map((c) => c.value) as [string, ...string[]];
export const languageValues = LANGUAGES.map((l) => l.value) as [string, ...string[]];
export const sealedValues = SEALED_TYPES.map((s) => s.value) as [string, ...string[]];

export function sealedLabel(value: string | null | undefined) {
  return SEALED_TYPES.find((s) => s.value === value)?.label ?? "Produit scellé";
}

export const DISCLAIMER =
  "Analyses automatisées fournies à titre informatif à partir des prix publics Cardmarket et TCGplayer. Ce n'est pas un conseil en investissement : le marché des cartes est volatil et peu liquide.";
