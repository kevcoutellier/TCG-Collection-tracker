"use client";

import { Check, Minus, Plus } from "lucide-react";
import Link from "next/link";
import { startTransition, useMemo, useState } from "react";
import { toast } from "sonner";
import { setCardQuantity } from "@/app/collection-actions";
import { CardImage } from "@/components/card-image";
import { cardHref } from "@/components/card-tile";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ChecklistEntry, ChecklistVariant } from "@/lib/checklist";
import { type CollectionItem, groupByCard, ownedByVariant, resolveVariantKey, setProgress } from "@/lib/collection";
import { eur } from "@/lib/format";
import type { Lang } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ChecklistFilter = "all" | "owned" | "missing";

const FALLBACK_VARIANT: ChecklistVariant = { key: "normal", type: "normal", label: "Normale", price: null };

/** Pastille courte d'une variante : N, H, R, PB (reverse Poké Ball), MB, 1re… */
function variantBadge(v: ChecklistVariant): string {
  if (v.label.includes("Poké Ball")) return "PB";
  if (v.label.includes("Master Ball")) return "MB";
  if (v.label.includes("1re édition")) return "1re";
  return v.type === "reverse" ? "R" : v.type === "holo" ? "H" : "N";
}

/**
 * Checklist d'une extension, façon classeur : toucher une carte la coche (variante principale) ou la décoche.
 * Une carte en plusieurs exemplaires ou variantes ouvre le détail, pour ne rien retirer par mégarde.
 * Les modifications s'affichent aussitôt et sont enregistrées en arrière-plan.
 */
export function SetChecklist({
  setId,
  cards,
  initialItems,
  official,
  lang,
  initialFilter = "all",
}: {
  setId: string;
  cards: ChecklistEntry[];
  initialItems: CollectionItem[];
  official: number;
  /** Langue enregistrée pour les cartes cochées depuis ce catalogue. */
  lang: Lang;
  initialFilter?: ChecklistFilter;
}) {
  const [rows, setRows] = useState(initialItems);
  const [filter, setFilter] = useState<ChecklistFilter>(initialFilter);
  const [openId, setOpenId] = useState<string | null>(null);

  // Next garde l'état des pages déjà visitées : en revenant sur l'extension (autre filtre demandé,
  // collection modifiée ailleurs), on repart des données fraîches envoyées par le serveur.
  const [synced, setSynced] = useState({ initialItems, initialFilter });
  if (synced.initialItems !== initialItems || synced.initialFilter !== initialFilter) {
    setSynced({ initialItems, initialFilter });
    setRows(initialItems);
    setFilter(initialFilter);
  }

  const byCard = useMemo(() => groupByCard(rows.filter((r) => r.quantity > 0)), [rows]);
  const progress = useMemo(() => setProgress(cards, rows, official), [cards, rows, official]);
  const ownedCount = cards.filter((c) => byCard.has(c.id)).length;
  const visible = filter === "all" ? cards : cards.filter((c) => byCard.has(c.id) === (filter === "owned"));
  const open = openId ? cards.find((c) => c.id === openId) : undefined;
  const pct = official ? Math.min(100, Math.round((progress.owned / official) * 100)) : 0;

  function write(next: CollectionItem) {
    const same = (r: CollectionItem) => r.cardId === next.cardId && r.lang === next.lang && r.variant === next.variant;
    const previous = rows.find(same);
    setRows((list) => [...list.filter((r) => !same(r)), ...(next.quantity > 0 ? [next] : [])]);
    startTransition(async () => {
      // Hors ligne, l'appel attend le retour du réseau (experimental.useOffline) : l'écran garde la modification.
      const res = await setCardQuantity({ cardId: next.cardId, lang: next.lang, variant: next.variant, quantity: next.quantity }).catch(
        () => ({ ok: false, message: "Enregistrement impossible, réessayez." }),
      );
      if (res.ok) return;
      setRows((list) => [...list.filter((r) => !same(r)), ...(previous ? [previous] : [])]);
      toast.error(res.message);
    });
  }

  function tap(card: ChecklistEntry) {
    const own = byCard.get(card.id) ?? [];
    const total = own.reduce((n, r) => n + r.quantity, 0);
    if (total === 0) write({ cardId: card.id, lang, setId, variant: (card.variants[0] ?? FALLBACK_VARIANT).key, quantity: 1 });
    else if (total === 1) write({ ...own[0], quantity: 0 });
    else setOpenId(card.id);
  }

  /** +1 / -1 sur une variante : on modifie de préférence l'exemplaire dans la langue du catalogue. */
  function step(card: ChecklistEntry, key: string, delta: 1 | -1) {
    const matching = (byCard.get(card.id) ?? []).filter((r) => resolveVariantKey(card, r.variant) === key);
    if (delta > 0) {
      const target = matching.find((r) => r.lang === lang) ?? { cardId: card.id, lang, setId, variant: key, quantity: 0 };
      write({ ...target, quantity: target.quantity + 1 });
    } else {
      const target = matching.find((r) => r.lang === lang) ?? matching[0];
      if (target) write({ ...target, quantity: target.quantity - 1 });
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border bg-card p-4 sm:p-5" aria-label="Avancement">
        <div className="flex items-baseline justify-between gap-3">
          <div className="num">
            <span className="text-3xl font-semibold tracking-tight">{progress.owned}</span>
            <span className="text-muted-foreground"> / {official} cartes</span>
          </div>
          <div className="num text-lg font-semibold">{pct} %</div>
        </div>
        <div
          role="progressbar"
          aria-label="Cartes officielles possédées"
          aria-valuemin={0}
          aria-valuemax={official}
          aria-valuenow={progress.owned}
          className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Secrètes incluses</dt>
            <dd className="num font-medium">
              {progress.ownedAll} / {progress.total}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Master set</dt>
            <dd className="num font-medium">
              {progress.masterOwned} / {progress.masterTotal}
            </dd>
          </div>
        </dl>
        <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-sm">
          {progress.missing > 0 ? (
            <>
              Il vous manque <strong className="num">{progress.missing}</strong> carte{progress.missing > 1 ? "s" : ""}
              {progress.missingCost != null && (
                <span className="text-muted-foreground"> · ≈ {eur(progress.missingCost, { compact: true })} à la cote Cardmarket</span>
              )}
            </>
          ) : (
            "Extension complète, bravo !"
          )}
        </p>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filtrer les cartes" className="grid grid-cols-3 rounded-lg bg-muted p-1 text-sm">
          {(
            [
              ["all", `Toutes · ${cards.length}`],
              ["owned", `Possédées · ${ownedCount}`],
              ["missing", `Manquantes · ${cards.length - ownedCount}`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "num min-h-9 rounded-md px-2.5 font-medium whitespace-nowrap text-muted-foreground transition-colors",
                filter === value && "bg-background text-foreground shadow-sm",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Touchez une carte pour la cocher, son nom pour les variantes.</p>
      </div>

      {visible.length ? (
        <ul className="grid grid-cols-3 gap-x-2.5 gap-y-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {visible.map((card) => {
            const own = byCard.get(card.id) ?? [];
            const owned = own.length > 0;
            const total = own.reduce((n, r) => n + r.quantity, 0);
            const qty = ownedByVariant(card, own);
            const variants = card.variants.length ? card.variants : [FALLBACK_VARIANT];
            return (
              <li key={card.id} className="flex min-w-0 flex-col gap-1">
                <button
                  type="button"
                  onClick={() => tap(card)}
                  aria-pressed={owned}
                  aria-label={`${card.name}, n° ${card.localId}, ${owned ? "possédée" : "manquante"}`}
                  className="relative block w-full rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
                >
                  <CardImage src={card.image} alt="" className={cn("transition duration-200", !owned && "opacity-35 grayscale")} />
                  {owned ? (
                    <span className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground">
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center rounded-[4.5%/3.2%] border-2 border-dashed border-muted-foreground/50">
                      <span className="flex size-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow">
                        <Plus className="size-4" />
                      </span>
                    </span>
                  )}
                  {total > 1 && (
                    <span className="num absolute bottom-1.5 left-1.5 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      ×{total}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setOpenId(card.id)}
                  aria-label={`Variantes de ${card.name}`}
                  className="flex min-h-11 min-w-0 flex-col justify-center rounded-md px-0.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
                >
                  <span className="truncate text-xs font-medium">{card.name}</span>
                  <span className="flex items-center justify-between gap-1">
                    <span className="num text-[11px] text-muted-foreground">
                      {card.localId}/{official}
                    </span>
                    <span className="flex gap-0.5" aria-hidden>
                      {variants.slice(0, 3).map((v) => (
                        <span
                          key={v.key}
                          className={cn(
                            "flex h-4 min-w-4 items-center justify-center rounded border px-0.5 text-[9px] leading-none font-bold",
                            qty.has(v.key) ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
                          )}
                        >
                          {variantBadge(v)}
                        </span>
                      ))}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          {filter === "owned" ? "Aucune carte cochée pour l'instant." : "Il ne manque aucune carte."}
        </p>
      )}

      <Sheet open={open != null} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent side="bottom" className="mx-auto max-h-[85dvh] max-w-lg overflow-y-auto rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
          {open && (
            <>
              <SheetHeader className="flex-row items-center gap-3 pr-12">
                <CardImage src={open.image} alt="" className="w-14 shrink-0" />
                <div className="min-w-0">
                  <SheetTitle className="truncate text-lg font-semibold">{open.name}</SheetTitle>
                  <SheetDescription>
                    n° {open.localId}/{official}
                    {open.rarity ? ` · ${open.rarity}` : ""}
                  </SheetDescription>
                </div>
              </SheetHeader>
              <ul className="divide-y px-4">
                {(open.variants.length ? open.variants : [FALLBACK_VARIANT]).map((v) => {
                  const n = ownedByVariant(open, byCard.get(open.id) ?? []).get(v.key) ?? 0;
                  return (
                    <li key={v.key} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{v.label}</div>
                        <div className="text-xs text-muted-foreground">{v.price != null ? `Cote ≈ ${eur(v.price)}` : "Pas de cote"}</div>
                      </div>
                      <Button variant="outline" size="icon-lg" className="size-11" aria-label={`Retirer un exemplaire ${v.label}`} disabled={!n} onClick={() => step(open, v.key, -1)}>
                        <Minus />
                      </Button>
                      <span className="num w-8 text-center text-lg font-semibold" aria-live="polite">
                        {n}
                      </span>
                      <Button size="icon-lg" className="size-11" aria-label={`Ajouter un exemplaire ${v.label}`} onClick={() => step(open, v.key, 1)}>
                        <Plus />
                      </Button>
                    </li>
                  );
                })}
              </ul>
              <div className="px-4">
                <Link href={cardHref(open.id, lang)} className={buttonVariants({ variant: "ghost", className: "w-full" })}>
                  Fiche complète et historique des prix
                </Link>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
