// Sélection du comparateur, encodée dans l'URL (« ?ids=sv03.5-199,en:base1-4 ») pour être partageable.
import type { Lang } from "./types";

export const MAX_COMPARE = 4;
export const COMPARE_STORAGE_KEY = "pokefolio:compare";

export interface CompareRef {
  id: string;
  lang: Lang;
}

const REF = /^(?:(fr|en|ja):)?([A-Za-z0-9][A-Za-z0-9._-]{0,59})$/;

/** Lit la liste « id » ou « langue:id » séparée par des virgules (doublons et excédent ignorés). */
export function parseCompareIds(raw: string | null | undefined): CompareRef[] {
  const out: CompareRef[] = [];
  for (const part of (raw ?? "").split(",")) {
    const m = REF.exec(part.trim());
    if (!m) continue;
    const ref = { id: m[2], lang: (m[1] ?? "fr") as Lang };
    if (!out.some((r) => r.id === ref.id && r.lang === ref.lang)) out.push(ref);
    if (out.length === MAX_COMPARE) break;
  }
  return out;
}

export function formatCompareIds(refs: readonly CompareRef[]): string {
  return refs.map((r) => (r.lang === "fr" ? r.id : `${r.lang}:${r.id}`)).join(",");
}

/** Lien vers une comparaison ; « ?ids= » vide marque une sélection volontairement vidée (pas de reprise). */
export function compareHref(refs: readonly CompareRef[]): string {
  return `/comparateur?ids=${formatCompareIds(refs)}`;
}

/** Ajoute une carte en fin de sélection ; la plus ancienne sort quand on dépasse le maximum. */
export function addCompareRef(refs: readonly CompareRef[], ref: CompareRef): CompareRef[] {
  const rest = refs.filter((r) => !(r.id === ref.id && r.lang === ref.lang));
  return [...rest, ref].slice(-MAX_COMPARE);
}
