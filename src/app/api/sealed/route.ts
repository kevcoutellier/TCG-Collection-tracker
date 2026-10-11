import type { NextRequest } from "next/server";
import { getSealedPickerExpansions, getSealedPickerProducts, searchSealedPickerProducts } from "@/lib/sealed";

/**
 * Catalogue des produits scellés (Cardmarket) pour le formulaire d'ajout :
 * - sans paramètre : liste des extensions ;
 * - `?expansion=<id>` : produits de l'extension avec leur cote ;
 * - `?q=<texte>` : recherche directe de produits (« ETB 151 », « Ultra Premium »…).
 */
export async function GET(request: NextRequest) {
  const expansion = Number(request.nextUrl.searchParams.get("expansion"));
  const q = request.nextUrl.searchParams.get("q")?.trim();
  try {
    if (q) return Response.json({ products: await searchSealedPickerProducts(q) });
    if (expansion > 0) return Response.json({ products: await getSealedPickerProducts(expansion) });
    return Response.json(await getSealedPickerExpansions());
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Catalogue Cardmarket indisponible" }, { status: 502 });
  }
}
