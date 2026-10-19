"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { setIdFromCardId } from "@/lib/collection";
import { setItemQuantity } from "@/lib/collection-db";
import type { ActionState } from "./actions";

const quantitySchema = z.object({
  cardId: z.string().trim().min(1).max(100),
  lang: z.enum(["fr", "en", "ja"]),
  variant: z.string().trim().min(1).max(100),
  quantity: z.number().int().min(0).max(9999),
});

/**
 * Fixe la quantité d'une carte × variante (0 = retirée). Appelée à chaque touche de la checklist :
 * l'écran est mis à jour aussitôt côté client, on ne rafraîchit donc pas la page ici.
 * Une quantité absolue (et non +1 / -1) rend l'appel rejouable sans risque.
 */
export async function setCardQuantity(input: z.input<typeof quantitySchema>): Promise<NonNullable<ActionState>> {
  const user = await requireUser();
  const parsed = quantitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Carte ou quantité invalide" };
  const { cardId, lang, variant, quantity } = parsed.data;
  try {
    // L'extension se déduit de l'ID de la carte : on ne fait pas confiance au client pour la fournir.
    await setItemQuantity(user.id, { cardId, lang, variant, quantity, setId: setIdFromCardId(cardId) });
    return { ok: true, message: quantity ? "Collection mise à jour" : "Carte retirée" };
  } catch (e) {
    console.error(e);
    return { ok: false, message: "Enregistrement impossible, réessayez." };
  }
}
