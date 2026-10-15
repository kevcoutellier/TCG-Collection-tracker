import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { cardHref } from "@/components/card-tile";
import { CardImage } from "@/components/card-image";
import { Delta, MoneyDelta } from "@/components/delta";
import {
  DeleteHoldingButton,
  EditHoldingDialog,
  SellDialog,
} from "@/components/forms/holding-forms";
import { Badge } from "@/components/ui/badge";
import { PRICE_SOURCE_LABELS, realizedPnl } from "@/lib/analysis";
import { LANGUAGES, sealedLabel } from "@/lib/constants";
import { dateText, eur } from "@/lib/format";
import type { HoldingRow, PositionView } from "@/lib/portfolio";

function ItemCell({ p }: { p: HoldingRow }) {
  const content = (
    <div className="flex min-w-0 items-center gap-3">
      <CardImage src={p.image} alt={p.name} className="w-9 shrink-0 rounded-[3px]" />
      <div className="min-w-0">
        <div className="truncate font-medium">{p.name}</div>
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <span className="truncate">{p.setName ?? (p.kind === "sealed" ? sealedLabel(p.sealedType) : "")}</span>
          {p.kind === "sealed" && <Badge variant="outline">{sealedLabel(p.sealedType).split(" (")[0]}</Badge>}
          {p.gradingCompany && (
            <Badge className="bg-primary/15 text-primary">
              {p.gradingCompany} {p.grade}
            </Badge>
          )}
          {p.kind === "card" && p.variantLabel && !["Normale", "Holo"].includes(p.variantLabel) && (
            <Badge variant="outline">{p.variantLabel}</Badge>
          )}
          {p.language !== "FR" && <Badge variant="outline">{p.language}</Badge>}
        </div>
      </div>
    </div>
  );
  return p.cardId ? (
    <Link href={cardHref(p.cardId, p.cardLang)} className="block rounded-md hover:opacity-90">
      {content}
    </Link>
  ) : (
    content
  );
}

/**
 * Détail de la cote d'un scellé : la tendance Cardmarket agrège toute l'Europe et toutes les langues,
 * d'où le lien vers les offres dans la langue de l'exemplaire.
 */
function SealedMarket({ p }: { p: PositionView }) {
  const m = p.marketPrice;
  const language = LANGUAGES.find((l) => l.value === p.marketLink?.language)?.label.toLowerCase();
  const range = [m?.low != null && `dès ${eur(m.low)}`, m?.avg30 != null && `30 j ${eur(m.avg30)}`].filter(Boolean).join(" · ");
  return (
    <div className="text-[11px] leading-snug text-muted-foreground">
      {p.priceSource === "manual" && m?.price != null && <div>Cardmarket {eur(m.price)}</div>}
      {range && <div>{range}</div>}
      {p.marketLink && (
        <a
          href={p.marketLink.url}
          target="_blank"
          rel="noopener noreferrer"
          title={language ? `Offres en ${language} sur Cardmarket` : "Voir le produit sur Cardmarket"}
          className="inline-flex items-center gap-0.5 text-primary hover:underline"
        >
          {p.marketLink.language ? `Offres ${p.marketLink.language}` : "Cardmarket"}
          <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  );
}

const SEALED_SOURCE_HINT =
  "Tendance Cardmarket : ventes de toute l'Europe, toutes langues confondues. Une version précise (FR…) peut se vendre plus cher.";

const th = "px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap";
const td = "px-3 py-2.5 align-middle whitespace-nowrap";

export function PositionsTable({ positions, today }: { positions: PositionView[]; today: string }) {
  const sorted = [...positions].sort((a, b) => b.value - a.value);
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="border-b bg-muted/30">
          <tr>
            <th className={th}>Objet</th>
            <th className={`${th} text-right`}>Qté</th>
            <th className={`${th} text-right`}>Prix d&apos;achat</th>
            <th className={`${th} text-right`}>Cote</th>
            <th className={`${th} text-right`}>Valeur</th>
            <th className={`${th} text-right`}>Plus-value</th>
            <th className={`${th} text-right`}>vs 30 j</th>
            <th className={th}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20">
              <td className={`${td} max-w-[320px]`}>
                <ItemCell p={p} />
              </td>
              <td className={`${td} num text-right`}>{p.quantity}</td>
              <td className={`${td} num text-right`}>
                {eur(p.purchasePrice)}
                <div className="text-xs text-muted-foreground">{dateText(p.purchaseDate)}</div>
              </td>
              <td className={`${td} num text-right`}>
                {eur(p.unitPrice)}
                <div className="text-xs text-muted-foreground" title={p.priceSource === "sealed" ? SEALED_SOURCE_HINT : undefined}>
                  {PRICE_SOURCE_LABELS[p.priceSource]}
                </div>
                {p.kind === "sealed" && <SealedMarket p={p} />}
              </td>
              <td className={`${td} num text-right font-medium`}>{eur(p.value, { compact: true })}</td>
              <td className={`${td} text-right`}>
                <MoneyDelta value={p.pnl} />
                <div className="text-xs">
                  <Delta value={p.pnlPct} icon={false} />
                </div>
              </td>
              <td className={`${td} text-right`}>
                <Delta value={p.vs30} className="text-xs" />
              </td>
              <td className={`${td} text-right`}>
                <div className="flex justify-end">
                  <SellDialog
                    holding={{ id: p.id, name: p.name, quantity: p.quantity, purchasePrice: p.purchasePrice, unitPrice: p.unitPrice }}
                    today={today}
                  />
                  <EditHoldingDialog
                    holding={{
                      id: p.id,
                      kind: p.kind,
                      name: p.name,
                      quantity: p.quantity,
                      purchasePrice: p.purchasePrice,
                      purchaseDate: p.purchaseDate,
                      manualPrice: p.manualPrice,
                      condition: p.condition,
                      gradingCompany: p.gradingCompany,
                      grade: p.grade,
                      notes: p.notes,
                      autoPriced: p.kind === "sealed" && p.productId != null,
                    }}
                    today={today}
                  />
                  <DeleteHoldingButton id={p.id} name={p.name} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SalesTable({ sold }: { sold: HoldingRow[] }) {
  const sorted = [...sold].sort((a, b) => (b.soldAt ?? "").localeCompare(a.soldAt ?? ""));
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="border-b bg-muted/30">
          <tr>
            <th className={th}>Objet</th>
            <th className={`${th} text-right`}>Qté</th>
            <th className={`${th} text-right`}>Achat</th>
            <th className={`${th} text-right`}>Vente</th>
            <th className={`${th} text-right`}>Frais</th>
            <th className={`${th} text-right`}>Plus-value réalisée</th>
            <th className={th}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((h) => {
            const pnl = realizedPnl(h);
            const cost = h.purchasePrice * h.quantity;
            return (
              <tr key={h.id} className="border-b last:border-0 hover:bg-muted/20">
                <td className={`${td} max-w-[320px]`}>
                  <ItemCell p={h} />
                </td>
                <td className={`${td} num text-right`}>{h.quantity}</td>
                <td className={`${td} num text-right`}>
                  {eur(h.purchasePrice)}
                  <div className="text-xs text-muted-foreground">{dateText(h.purchaseDate)}</div>
                </td>
                <td className={`${td} num text-right`}>
                  {eur(h.salePrice)}
                  <div className="text-xs text-muted-foreground">{dateText(h.soldAt)}</div>
                </td>
                <td className={`${td} num text-right text-muted-foreground`}>{eur(h.saleFees)}</td>
                <td className={`${td} text-right`}>
                  <MoneyDelta value={pnl} />
                  <div className="text-xs">
                    <Delta value={cost > 0 ? pnl / cost : null} icon={false} />
                  </div>
                </td>
                <td className={`${td} text-right`}>
                  <DeleteHoldingButton id={h.id} name={h.name} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
