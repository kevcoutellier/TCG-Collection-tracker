"use client";

import { BellRing, Eye, Loader2, RefreshCw, Target, X } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { type ActionState, addToWatchlist, refreshPrices, removeFromWatchlist, updateWatch } from "@/app/actions";
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
import { eur } from "@/lib/format";
import { Field, Hidden } from "./field";
import type { CardRef } from "./holding-forms";

export function WatchDialog({
  card,
  variants,
  existing,
}: {
  card: CardRef;
  variants: { key: string; label: string; price: number | null }[];
  existing?: { id: string; targetPrice: number | null; note: string | null } | null;
}) {
  const [open, setOpen] = useState(false);
  const action = existing ? updateWatch.bind(null, existing.id) : addToWatchlist;
  const [, formAction, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const res = await action(prev, fd);
    if (res?.ok) {
      toast.success(res.message);
      setOpen(false);
    } else if (res) toast.error(res.message);
    return res;
  }, null);
  const [variantKey, setVariantKey] = useState(variants[0]?.key ?? "normal");
  const current = (variants.find((v) => v.key === variantKey) ?? variants[0])?.price;

  return (
    <Dialog open={open} onOpenChange={setOpen} disablePointerDismissal>
      <DialogTrigger render={<Button variant="outline" />}>
        {existing ? <BellRing /> : <Eye />}
        {existing ? "Modifier l'alerte" : "Surveiller"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Modifier l'objectif" : "Ajouter à la watchlist"}</DialogTitle>
          <DialogDescription>
            Fixez un prix d&apos;achat cible : la carte sera signalée dès que la tendance du marché passe en dessous.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          {!existing && (
            <Hidden
              values={{
                cardId: card.cardId,
                cardLang: card.cardLang,
                name: card.name,
                setName: card.setName,
                image: card.image,
                rarity: card.rarity,
                variantLabel: variants.find((v) => v.key === variantKey)?.label,
              }}
            />
          )}
          {!existing &&
            (variants.length > 1 ? (
              <Field label="Variante suivie" htmlFor="watch-variant">
                <NativeSelect id="watch-variant" name="variant" value={variantKey} onChange={(e) => setVariantKey(e.target.value)}>
                  {variants.map((v) => (
                    <option key={v.key} value={v.key}>
                      {v.label} — {eur(v.price)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : (
              <input type="hidden" name="variant" value={variantKey} />
            ))}
          <Field
            label="Prix cible (€)"
            htmlFor="targetPrice"
            hint={current != null ? `Cote actuelle : ${eur(current)} — par ex. −10 % = ${eur(current * 0.9)}` : undefined}
          >
            <Input
              id="targetPrice"
              name="targetPrice"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              key={variantKey}
              defaultValue={existing?.targetPrice ?? (current != null ? (current * 0.9).toFixed(2) : "")}
            />
          </Field>
          <Field label="Note" htmlFor="note">
            <Textarea id="note" name="note" rows={2} defaultValue={existing?.note ?? ""} placeholder="Pourquoi cette carte ?" />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Target />}
              {existing ? "Enregistrer" : "Surveiller"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveWatchButton({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Retirer ${name} de la watchlist`}
      disabled={pending}
      className="text-muted-foreground hover:text-destructive"
      onClick={() =>
        startTransition(async () => {
          const res = await removeFromWatchlist(id);
          if (res?.ok) toast.success(res.message);
          else if (res) toast.error(res.message);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <X />}
    </Button>
  );
}

export function RefreshPricesButton({ variant = "outline" }: { variant?: "outline" | "ghost" | "secondary" }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant={variant}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await refreshPrices();
          if (res?.ok) toast.success(res.message);
          else if (res) toast.error(res.message);
        })
      }
    >
      <RefreshCw className={pending ? "animate-spin" : undefined} />
      {pending ? "Relevé en cours…" : "Relever les prix"}
    </Button>
  );
}
