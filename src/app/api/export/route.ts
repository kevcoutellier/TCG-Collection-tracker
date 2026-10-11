import { loadPortfolio } from "@/lib/portfolio";
import { todayISO } from "@/lib/format";

const COLUMNS = [
  "type",
  "nom",
  "extension",
  "id_carte",
  "finition",
  "langue",
  "etat",
  "gradation",
  "quantite",
  "prix_achat_unitaire",
  "date_achat",
  "cote_unitaire",
  "valeur",
  "plus_value",
  "date_vente",
  "prix_vente_unitaire",
  "frais_vente",
  "notes",
] as const;

function cell(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "number" ? String(Math.round(v * 100) / 100).replace(".", ",") : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Export CSV (séparateur « ; », décimales à virgule) lisible directement dans Excel en français. */
export async function GET() {
  const { positions, sold } = await loadPortfolio();
  const rows = [
    ...positions,
    ...sold.map((h) => ({ ...h, unitPrice: null, value: null, pnl: null })),
  ];
  const lines = rows.map((r) =>
    [
      r.kind === "sealed" ? "scellé" : "carte",
      r.name,
      r.setName,
      r.cardId,
      r.variant,
      r.language,
      r.condition,
      r.gradingCompany ? `${r.gradingCompany} ${r.grade ?? ""}`.trim() : "",
      r.quantity,
      r.purchasePrice,
      r.purchaseDate,
      r.unitPrice,
      r.value,
      r.pnl,
      r.soldAt,
      r.salePrice,
      r.saleFees,
      r.notes,
    ]
      .map(cell)
      .join(";"),
  );
  const csv = `﻿${COLUMNS.join(";")}\n${lines.join("\n")}\n`;
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="pokefolio-${todayISO()}.csv"`,
    },
  });
}
