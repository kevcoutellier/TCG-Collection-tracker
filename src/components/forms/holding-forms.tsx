"use client";

import { ArrowLeft, Loader2, PackagePlus, Pencil, Plus, Search, Tag, Trash2 } from "lucide-react";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  type ActionState,
  addCardHolding,
  addSealedHolding,
  deleteHolding,
  sellHolding,
  updateHolding,
} from "@/app/actions";
import { GradeFields, type GradedVariantOption, scaleOf } from "@/components/graded";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_FEES } from "@/lib/analysis";
import { CONDITIONS, LANGUAGES, SEALED_TYPES } from "@/lib/constants";
import { dateText, eur, signedEur } from "@/lib/format";
import { GRADING_COMPANIES, gradeQuote } from "@/lib/graded-model";
import type { Lang } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Field, Hidden } from "./field";

/** Enveloppe une Server Action : notification + fermeture du dialogue en cas de succès. */
function useDialogAction(
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>,
  onSuccess: () => void,
) {
  return useActionState(async (prev: ActionState, fd: FormData) => {
    const res = await action(prev, fd);
    if (res?.ok) {
      toast.success(res.message);
      onSuccess();
    } else if (res) {
      toast.error(res.message);
    }
    return res;
  }, null);
}

function SubmitButton({ pending, children, disabled }: { pending: boolean; children: React.ReactNode; disabled?: boolean }) {
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}

const FORM_DIALOG = "max-h-[90vh] overflow-y-auto sm:max-w-lg";
const CARD_LANGUAGE: Record<Lang, string> = { fr: "FR", en: "EN", ja: "JP" };

/* ------------------------------------------------------------------ */

export interface CardRef {
  cardId: string;
  cardLang: Lang;
  name: string;
  setName?: string | null;
  image?: string | null;
  rarity?: string | null;
}

export function AddHoldingDialog({
  card,
  variants,
  ageYears,
  today,
  size = "default",
}: {
  card: CardRef;
  variants: GradedVariantOption[];
  ageYears: number | null;
  today: string;
  size?: "default" | "sm" | "lg";
}) {
  const [open, setOpen] = useState(false);
  const [variantKey, setVariantKey] = useState(variants[0]?.key ?? "normal");
  const variant = variants.find((v) => v.key === variantKey) ?? variants[0];
  const [graded, setGraded] = useState(false);
  const [price, setPrice] = useState(variant?.price?.toFixed(2) ?? "");
  const [priceTouched, setPriceTouched] = useState(false);
  const [, formAction, pending] = useDialogAction(addCardHolding, () => setOpen(false));

  // Tant que l'utilisateur n'a pas saisi son prix, on propose la cote de la sélection.
  const suggest = (p: number | null | undefined) => {
    if (!priceTouched && p != null) setPrice(p.toFixed(2));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen} disablePointerDismissal>
      <DialogTrigger render={<Button size={size} />}>
        <Plus />
        Ajouter à ma collection
      </DialogTrigger>
      <DialogContent className={FORM_DIALOG}>
        <DialogHeader>
          <DialogTitle>Ajouter « {card.name} »</DialogTitle>
          <DialogDescription>{card.setName}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <Hidden
            values={{
              cardId: card.cardId,
              cardLang: card.cardLang,
              name: card.name,
              setName: card.setName,
              image: card.image,
              rarity: card.rarity,
              variantLabel: variant?.label,
            }}
          />
          <Field label={`Variante (${variants.length})`} htmlFor="variant">
            <NativeSelect
              id="variant"
              name="variant"
              value={variantKey}
              onChange={(e) => {
                setVariantKey(e.target.value);
                if (!graded) suggest(variants.find((v) => v.key === e.target.value)?.price);
              }}
            >
              {variants.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.label} — {eur(v.price)}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={graded}
              onChange={(e) => {
                setGraded(e.target.checked);
                // Cote proposée : PSA 10 (valeurs par défaut du sélecteur) ou carte brute.
                suggest(e.target.checked && variant ? gradeQuote("PSA", "10", variant.price, ageYears, variant.sales).price : variant?.price);
              }}
              className="size-4 accent-[var(--primary)]"
            />
            Carte gradée (PSA, CGC, BGS, PCA…)
          </label>
          {graded && variant && (
            <div className="space-y-3 rounded-lg border border-dashed p-3">
              <GradeFields
                key={variant.key}
                raw={variant.price}
                ageYears={ageYears}
                sales={variant.sales}
                onQuoteChange={(q) => suggest(q.price)}
              />
              <Field label="Valeur personnalisée (€, optionnel)" htmlFor="manualPrice" hint="Vide = cote gradée automatique">
                <Input id="manualPrice" name="manualPrice" type="number" min={0} step="0.01" inputMode="decimal" />
              </Field>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantité" htmlFor="quantity">
              <Input id="quantity" name="quantity" type="number" min={1} step={1} defaultValue={1} required />
            </Field>
            <Field label="Prix d'achat unitaire (€)" htmlFor="purchasePrice" hint="Frais de port inclus si possible">
              <Input
                id="purchasePrice"
                name="purchasePrice"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={price}
                onChange={(e) => {
                  setPriceTouched(true);
                  setPrice(e.target.value);
                }}
                required
              />
            </Field>
            <Field label="Date d'achat" htmlFor="purchaseDate">
              <Input id="purchaseDate" name="purchaseDate" type="date" defaultValue={today} max={today} required />
            </Field>
            <Field label="État" htmlFor="condition">
              <NativeSelect id="condition" name="condition" defaultValue="NM">
                {CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Langue de la carte" htmlFor="language" className="col-span-2 sm:col-span-1">
              <NativeSelect id="language" name="language" defaultValue={CARD_LANGUAGE[card.cardLang]}>
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>

          <Field label="Notes" htmlFor="notes">
            <Textarea id="notes" name="notes" rows={2} placeholder="Lieu d'achat, centrage, projet de grading…" />
          </Field>
          <DialogFooter>
            <SubmitButton pending={pending}>Ajouter</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

interface ExpansionOption {
  id: number;
  label: string;
  alias: string | null;
  jp: { code: string; name: string } | null;
  latest: string | null;
  count: number;
}

interface ProductOption {
  idProduct: number;
  name: string;
  category: string;
  type: string;
  dateAdded: string | null;
  price: number | null;
  avg30: number | null;
  expansion?: string | null;
}

function ProductRow({ p, onClick, showExpansion }: { p: ProductOption; onClick: () => void; showExpansion?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent">
      <span className="min-w-0">
        <span className="block truncate">{p.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {p.category}
          {showExpansion && p.expansion ? ` · ${p.expansion}` : ""}
        </span>
      </span>
      <span className="num shrink-0 font-medium">{eur(p.price)}</span>
    </button>
  );
}

function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Sélection d'un produit scellé dans le catalogue Cardmarket : extension, puis produit. */
function SealedPicker({ onSelect }: { onSelect: (p: ProductOption, expansionName: string, jp: boolean) => void }) {
  const [expansions, setExpansions] = useState<ExpansionOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expansion, setExpansion] = useState<ExpansionOption | null>(null);
  const [products, setProducts] = useState<ProductOption[] | null>(null);
  const [found, setFound] = useState<{ q: string; products: ProductOption[] } | null>(null);
  const searching = query.trim().length >= 3;

  // Recherche directe de produits (« ETB 151 », « UPC Dracaufeu »), avec un léger délai de frappe.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    const timer = setTimeout(() => {
      fetch(`/api/sealed?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { products: ProductOption[] } | null) => d && setFound({ q, products: d.products }))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sealed")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { expansions: ExpansionOption[] }) => !cancelled && setExpansions(d.expansions))
      .catch(() => !cancelled && setError("Catalogue Cardmarket indisponible pour le moment."));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!expansion) return;
    let cancelled = false;
    fetch(`/api/sealed?expansion=${expansion.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { products: ProductOption[] }) => !cancelled && setProducts(d.products))
      .catch(() => !cancelled && setError("Impossible de charger les produits de cette extension."));
    return () => {
      cancelled = true;
    };
  }, [expansion]);

  const matches = useMemo(() => {
    if (!expansions) return [];
    const q = normalize(query.trim());
    const list = q
      ? expansions.filter((e) => normalize(`${e.label} ${e.alias ?? ""} ${e.jp?.code ?? ""} ${e.jp?.name ?? ""}`).includes(q))
      : expansions;
    return list.slice(0, q ? 8 : 60);
  }, [expansions, query]);

  if (error) return <p className="rounded-lg border border-loss/30 bg-loss/10 p-3 text-sm">{error}</p>;

  if (expansion) {
    const name = expansion.alias ?? expansion.label;
    return (
      <div className="space-y-2">
        <button type="button" onClick={() => setExpansion(null)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Changer d&apos;extension
        </button>
        <div className="text-sm font-medium">
          {name}
          {expansion.jp && <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px]">JP {expansion.jp.code}</span>}
        </div>
        {!products ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Chargement des produits…
          </div>
        ) : (
          <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
            {products.map((p) => (
              <li key={p.idProduct}>
                <ProductRow p={p} onClick={() => onSelect(p, name, Boolean(expansion.jp))} />
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Extension ou produit : Évolutions Prismatiques, ETB 151…"
          className="pl-8"
          aria-label="Rechercher une extension"
        />
      </div>
      {!expansions ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Chargement du catalogue Cardmarket…
        </div>
      ) : (
        <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
          {searching && <li className="bg-muted/40 px-3 py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Extensions</li>}
          {matches.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => {
                  setProducts(null);
                  setExpansion(e);
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="min-w-0">
                  <span className="block truncate">
                    {e.alias ?? e.label}
                    {e.jp && <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px]">JP {e.jp.code}</span>}
                  </span>
                  {(e.alias || e.jp) && <span className="block truncate text-xs text-muted-foreground">{e.jp ? `${e.label} · ${e.jp.name}` : e.label}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {e.count} produit{e.count > 1 ? "s" : ""}
                  {e.latest ? ` · ${dateText(e.latest, { short: true })} ${e.latest.slice(0, 4)}` : ""}
                </span>
              </button>
            </li>
          ))}
          {!matches.length && <li className="px-3 py-3 text-sm text-muted-foreground">Aucune extension trouvée.</li>}
          {searching && (
            <>
              <li className="bg-muted/40 px-3 py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Produits</li>
              {found?.q === query.trim() ? (
                found.products.length ? (
                  found.products.map((p) => (
                    <li key={p.idProduct}>
                      <ProductRow p={p} showExpansion onClick={() => onSelect(p, p.expansion || "", false)} />
                    </li>
                  ))
                ) : (
                  <li className="px-3 py-3 text-sm text-muted-foreground">Aucun produit trouvé.</li>
                )
              ) : (
                <li className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Recherche…
                </li>
              )}
            </>
          )}
        </ul>
      )}
    </div>
  );
}

export function AddSealedDialog({ today, variant = "outline" }: { today: string; variant?: "outline" | "default" }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"catalog" | "manual">("catalog");
  const [selected, setSelected] = useState<{ product: ProductOption; expansion: string; jp: boolean } | null>(null);
  const [price, setPrice] = useState("");
  const [, formAction, pending] = useDialogAction(addSealedHolding, () => setOpen(false));

  const reset = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setSelected(null);
      setMode("catalog");
      setPrice("");
    }
  };

  const showForm = mode === "manual" || selected;

  return (
    <Dialog open={open} onOpenChange={reset} disablePointerDismissal>
      <DialogTrigger render={<Button variant={variant} />}>
        <PackagePlus />
        Produit scellé
      </DialogTrigger>
      <DialogContent className={FORM_DIALOG}>
        <DialogHeader>
          <DialogTitle>Ajouter un produit scellé</DialogTitle>
          <DialogDescription>
            Choisissez l&apos;extension puis le produit : sa cote Cardmarket est récupérée et mise à jour automatiquement.
          </DialogDescription>
        </DialogHeader>

        {mode === "catalog" && !selected && (
          <>
            <SealedPicker
              onSelect={(product, expansion, jp) => {
                setSelected({ product, expansion, jp });
                setPrice(product.price?.toFixed(2) ?? "");
              }}
            />
            <button type="button" onClick={() => setMode("manual")} className="text-left text-xs text-muted-foreground underline-offset-2 hover:underline">
              Produit introuvable ? Saisie manuelle
            </button>
          </>
        )}

        {showForm && (
          <form action={formAction} className="grid gap-4">
            {selected ? (
              <>
                <Hidden
                  values={{
                    productId: String(selected.product.idProduct),
                    name: selected.product.name,
                    sealedType: SEALED_TYPES.some((t) => t.value === selected.product.type) ? selected.product.type : "other",
                    setName: selected.expansion,
                  }}
                />
                <div className="flex items-start justify-between gap-3 rounded-lg bg-muted/60 p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{selected.product.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {selected.expansion} · {selected.product.category}
                    </div>
                    <button type="button" onClick={() => setSelected(null)} className="mt-1 text-xs text-primary hover:underline">
                      Changer de produit
                    </button>
                  </div>
                  <div className="text-right">
                    <div className="num font-semibold">{eur(selected.product.price)}</div>
                    <div className="text-[11px] text-muted-foreground">cote Cardmarket</div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <Field label="Nom du produit" htmlFor="name">
                  <Input id="name" name="name" placeholder="Display Évolutions Prismatiques" required />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Type" htmlFor="sealedType">
                    <NativeSelect id="sealedType" name="sealedType" defaultValue="display">
                      {SEALED_TYPES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label="Extension" htmlFor="setName">
                    <Input id="setName" name="setName" placeholder="Évolutions Prismatiques" />
                  </Field>
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Langue" htmlFor="language">
                <NativeSelect id="language" name="language" defaultValue={selected?.jp ? "JP" : "FR"} key={selected?.product.idProduct ?? "manual"}>
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Quantité" htmlFor="quantity">
                <Input id="quantity" name="quantity" type="number" min={1} step={1} defaultValue={1} required />
              </Field>
              <Field label="Prix d'achat unitaire (€)" htmlFor="purchasePrice">
                <Input
                  id="purchasePrice"
                  name="purchasePrice"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
              </Field>
              <Field label="Date d'achat" htmlFor="purchaseDate">
                <Input id="purchaseDate" name="purchaseDate" type="date" defaultValue={today} max={today} required />
              </Field>
              {!selected && (
                <>
                  <Field label="Valeur actuelle unitaire (€)" htmlFor="manualPrice" hint="Vide = prix d'achat">
                    <Input id="manualPrice" name="manualPrice" type="number" min={0} step="0.01" inputMode="decimal" />
                  </Field>
                  <Field label="Image (URL, optionnel)" htmlFor="image">
                    <Input id="image" name="image" type="url" placeholder="https://…" />
                  </Field>
                </>
              )}
            </div>
            <Field label="Notes" htmlFor="notes">
              <Textarea id="notes" name="notes" rows={2} placeholder="Lieu de stockage, protection acrylique…" />
            </Field>
            <DialogFooter className="items-center sm:justify-between">
              {mode === "manual" && !selected ? (
                <button type="button" onClick={() => setMode("catalog")} className="text-xs text-muted-foreground hover:underline">
                  Revenir au catalogue
                </button>
              ) : (
                <span />
              )}
              <SubmitButton pending={pending}>Ajouter</SubmitButton>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

export interface EditableHolding {
  id: string;
  kind: "card" | "sealed";
  name: string;
  quantity: number;
  purchasePrice: number;
  purchaseDate: string;
  manualPrice: number | null;
  condition: string;
  gradingCompany: string | null;
  grade: string | null;
  notes: string | null;
  /** Produit scellé coté automatiquement (la valeur manuelle devient facultative). */
  autoPriced?: boolean;
}

export function EditHoldingDialog({ holding, today }: { holding: EditableHolding; today: string }) {
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState(holding.gradingCompany ?? "");
  const [, formAction, pending] = useDialogAction(updateHolding.bind(null, holding.id), () => setOpen(false));
  const isCard = holding.kind === "card";
  const auto = isCard || holding.autoPriced;
  return (
    <Dialog open={open} onOpenChange={setOpen} disablePointerDismissal>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Modifier ${holding.name}`} />}>
        <Pencil />
      </DialogTrigger>
      <DialogContent className={FORM_DIALOG}>
        <DialogHeader>
          <DialogTitle>Modifier « {holding.name} »</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantité" htmlFor="quantity">
              <Input id="quantity" name="quantity" type="number" min={1} step={1} defaultValue={holding.quantity} required />
            </Field>
            <Field label="Prix d'achat unitaire (€)" htmlFor="purchasePrice">
              <Input
                id="purchasePrice"
                name="purchasePrice"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                defaultValue={holding.purchasePrice}
                required
              />
            </Field>
            <Field label="Date d'achat" htmlFor="purchaseDate">
              <Input id="purchaseDate" name="purchaseDate" type="date" defaultValue={holding.purchaseDate} max={today} required />
            </Field>
            <Field
              label="Valeur manuelle unitaire (€)"
              htmlFor="manualPrice"
              hint={auto ? "Vide = cote automatique" : "Valeur actuelle estimée"}
            >
              <Input
                id="manualPrice"
                name="manualPrice"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                defaultValue={holding.manualPrice ?? ""}
              />
            </Field>
            {isCard && (
              <>
                <Field label="État" htmlFor="condition">
                  <NativeSelect id="condition" name="condition" defaultValue={holding.condition}>
                    {CONDITIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Gradée par" htmlFor="gradingCompany">
                    <NativeSelect id="gradingCompany" name="gradingCompany" value={company} onChange={(e) => setCompany(e.target.value)}>
                      <option value="">Non gradée</option>
                      {GRADING_COMPANIES.map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                      <option value="Autre">Autre</option>
                    </NativeSelect>
                  </Field>
                  <Field label="Note" htmlFor="grade">
                    {company ? (
                      <NativeSelect id="grade" name="grade" defaultValue={holding.grade ?? scaleOf(company)[0]} key={company}>
                        {scaleOf(company).map((g) => (
                          <option key={g}>{g}</option>
                        ))}
                      </NativeSelect>
                    ) : (
                      <Input id="grade" value="—" disabled />
                    )}
                  </Field>
                </div>
              </>
            )}
          </div>
          <Field label="Notes" htmlFor="notes">
            <Textarea id="notes" name="notes" rows={2} defaultValue={holding.notes ?? ""} />
          </Field>
          <DialogFooter>
            <SubmitButton pending={pending}>Enregistrer</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

export function SellDialog({
  holding,
  today,
}: {
  holding: { id: string; name: string; quantity: number; purchasePrice: number; unitPrice: number | null };
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(String(holding.quantity));
  const [price, setPrice] = useState(holding.unitPrice?.toFixed(2) ?? "");
  const [fees, setFees] = useState("");
  const [, formAction, pending] = useDialogAction(sellHolding.bind(null, holding.id), () => setOpen(false));

  const q = Number(qty) || 0;
  const p = Number(price.replace(",", ".")) || 0;
  const f = fees === "" ? q * p * DEFAULT_FEES.rate : Number(fees.replace(",", ".")) || 0;
  const net = q * p - f;
  const profit = net - q * holding.purchasePrice;

  return (
    <Dialog open={open} onOpenChange={setOpen} disablePointerDismissal>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Vendre ${holding.name}`} />}>
        <Tag />
      </DialogTrigger>
      <DialogContent className={FORM_DIALOG}>
        <DialogHeader>
          <DialogTitle>Enregistrer une vente</DialogTitle>
          <DialogDescription>
            « {holding.name} » — la plus-value réalisée sera ajoutée à vos statistiques.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Quantité vendue (max ${holding.quantity})`} htmlFor="sell-qty">
              <Input
                id="sell-qty"
                name="quantity"
                type="number"
                min={1}
                max={holding.quantity}
                step={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                required
              />
            </Field>
            <Field label="Prix de vente unitaire (€)" htmlFor="salePrice">
              <Input
                id="salePrice"
                name="salePrice"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </Field>
            <Field label="Frais totaux (€)" htmlFor="saleFees" hint={`Vide = commission ${DEFAULT_FEES.rate * 100} % estimée`}>
              <Input
                id="saleFees"
                name={fees === "" ? undefined : "saleFees"}
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={fees}
                placeholder={(q * p * DEFAULT_FEES.rate).toFixed(2)}
                onChange={(e) => setFees(e.target.value)}
              />
            </Field>
            <Field label="Date de vente" htmlFor="soldAt">
              <Input id="soldAt" name="soldAt" type="date" defaultValue={today} max={today} required />
            </Field>
          </div>
          {fees === "" && <input type="hidden" name="saleFees" value={f.toFixed(2)} />}
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/60 p-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Encaissé net</div>
              <div className="num font-semibold">{eur(net)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Plus-value</div>
              <div className={cn("num font-semibold", profit >= 0 ? "text-gain" : "text-loss")}>{signedEur(profit)}</div>
            </div>
          </div>
          <DialogFooter>
            <SubmitButton pending={pending}>Valider la vente</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

export function DeleteHoldingButton({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Supprimer ${name}`}
      disabled={pending}
      className="text-muted-foreground hover:text-destructive"
      onClick={() => {
        if (!window.confirm(`Supprimer « ${name} » de votre collection ? Cette action est définitive.`)) return;
        startTransition(async () => {
          const res = await deleteHolding(id);
          if (res?.ok) toast.success(res.message);
          else if (res) toast.error(res.message);
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  );
}
