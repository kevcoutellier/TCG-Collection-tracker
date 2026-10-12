"use client";

import { AlertCircle, Camera, CheckCircle2, ImagePlus, Loader2, Plus, ScanText, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { addScannedCards } from "@/app/actions";
import { NativeSelect } from "@/components/native-select";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mapLimit } from "@/lib/async";
import { eur } from "@/lib/format";
import type { ScanDetection } from "@/lib/scan-model";
import type { Lang } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CardSearch } from "./card-search";
import { DetectionRow } from "./detection-row";
import { createOcrReader, type OcrReader, preparePhoto } from "./photo";
import { manualRow, rowFromDetection, rowsToItems, type ScanRow, selectedCandidate, suggestedPrice } from "./rows";

type Engine = "vision" | "ocr";

interface Photo {
  id: string;
  url: string | null;
  status: "preparing" | "analyzing" | "done" | "error";
  progress: number | null;
  found: number;
  error: string | null;
}

let counter = 0;
const nextId = () => `p${Date.now().toString(36)}${(counter++).toString(36)}`;

async function postJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
  return data;
}

export function CardScanner({ engine: initialEngine, today }: { engine: Engine; today: string }) {
  const [engine, setEngine] = useState<Engine>(initialEngine);
  const [lang, setLang] = useState<Lang>("fr");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const engineRef = useRef<Engine>(initialEngine);
  const ocr = useRef<OcrReader | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const urls = useRef(new Set<string>());
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const created = urls.current;
    return () => {
      for (const u of created) URL.revokeObjectURL(u);
      void ocr.current?.dispose();
    };
  }, []);

  const patchPhoto = (id: string, patch: Partial<Photo>) => setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  async function detect(photoId: string, image: Blob, cardLang: Lang): Promise<ScanDetection[]> {
    if (engineRef.current === "vision") {
      const body = new FormData();
      body.append("image", image, "photo.jpg");
      body.append("lang", cardLang);
      const res = await fetch("/api/scan", { method: "POST", body });
      if (res.status !== 501) return (await postJson<{ detections: ScanDetection[] }>(res)).detections;
      // Clé retirée entre-temps : on bascule sur l'OCR local.
      engineRef.current = "ocr";
      setEngine("ocr");
    }
    ocr.current ??= createOcrReader();
    const text = await ocr.current.read(image, (p) => patchPhoto(photoId, { progress: p }));
    const res = await fetch("/api/scan/ocr", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 20000), lang: cardLang }),
    });
    return (await postJson<{ detections: ScanDetection[] }>(res)).detections;
  }

  async function processPhoto(photoId: string, file: File, cardLang: Lang) {
    try {
      const image = await preparePhoto(file);
      const url = URL.createObjectURL(image);
      urls.current.add(url);
      patchPhoto(photoId, { url, status: "analyzing" });
      const detections = await detect(photoId, image, cardLang);
      setRows((rs) => [...rs, ...detections.map((d) => rowFromDetection(d, photoId))]);
      patchPhoto(photoId, { status: "done", progress: null, found: detections.filter((d) => d.candidates.length).length });
    } catch (e) {
      const message = e instanceof DOMException || (e as Error).message === "Canvas indisponible" ? "Format de photo non pris en charge" : (e as Error).message;
      patchPhoto(photoId, { status: "error", progress: null, error: message || "Analyse impossible" });
    }
  }

  function addFiles(list: FileList | null) {
    const files = [...(list ?? [])].filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)).slice(0, 12);
    if (!files.length) return;
    setDone(null);
    const batch = files.map((file) => ({ file, id: nextId() }));
    setPhotos((ps) => [...ps, ...batch.map(({ id }) => ({ id, url: null, status: "preparing" as const, progress: null, found: 0, error: null }))]);
    const cardLang = lang;
    // Les lots s'enchaînent ; l'IA traite 3 photos à la fois, l'OCR local une seule.
    queue.current = queue.current.then(() =>
      mapLimit(batch, engineRef.current === "vision" ? 3 : 1, ({ file, id }) => processPhoto(id, file, cardLang)),
    );
  }

  function removePhoto(id: string) {
    const photo = photos.find((p) => p.id === id);
    if (photo?.url) {
      URL.revokeObjectURL(photo.url);
      urls.current.delete(photo.url);
    }
    setPhotos((ps) => ps.filter((p) => p.id !== id));
    setRows((rs) => rs.filter((r) => r.photoId !== id));
  }

  function reset() {
    for (const u of urls.current) URL.revokeObjectURL(u);
    urls.current.clear();
    setPhotos([]);
    setRows([]);
  }

  const items = rowsToItems(rows);
  const count = items.reduce((a, i) => a + i.quantity, 0);
  const totalCost = items.reduce((a, i) => a + i.quantity * i.purchasePrice, 0);
  const totalValue = rows.reduce((a, r) => {
    const c = selectedCandidate(r);
    const price = c ? suggestedPrice(r, c, r.variantKey) : null;
    return r.include && price != null ? a + price * (Number(r.quantity) || 1) : a;
  }, 0);
  const busy = photos.some((p) => p.status === "preparing" || p.status === "analyzing");

  const submit = () =>
    startTransition(async () => {
      const res = await addScannedCards({ purchaseDate, items });
      if (res?.ok) {
        toast.success(res.message);
        setDone(res.message);
        reset();
      } else if (res) {
        toast.error(res.message);
      }
    });

  return (
    <div className="space-y-6 pb-24">
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl border p-3 text-sm",
          engine === "vision" ? "border-primary/30 bg-primary/5" : "bg-muted/40",
        )}
      >
        {engine === "vision" ? <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" /> : <ScanText className="mt-0.5 size-4 shrink-0" />}
        <p className="text-pretty">
          {engine === "vision" ? (
            <>
              <span className="font-medium">Identification par IA.</span> Plusieurs cartes par photo, cartes gradées comprises : nom, numéro,
              langue, finition et note sont lus puis rapprochés du catalogue.
            </>
          ) : (
            <>
              <span className="font-medium">Lecture locale (OCR, sans IA).</span> Le numéro « 199/165 » de chaque carte est lu dans votre
              navigateur, puis rapproché du catalogue. Idéal avec une à quatre cartes à plat, nettes et sans reflet. Pour l&apos;identification
              par IA, configurez <code className="text-xs">ANTHROPIC_API_KEY</code>.
            </>
          )}
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center gap-4 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border",
        )}
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="lg" onClick={() => camera.current?.click()}>
            <Camera />
            Prendre une photo
          </Button>
          <Button size="lg" variant="outline" onClick={() => gallery.current?.click()}>
            <ImagePlus />
            Importer des photos
          </Button>
        </div>
        <p className="max-w-md text-xs text-muted-foreground text-pretty">
          Ou glissez vos photos ici. Posez les cartes à plat sur un fond uni, bien éclairées, numéros lisibles.
        </p>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Cartes principalement en
          <NativeSelect value={lang} onChange={(e) => setLang(e.target.value as Lang)} className="h-7 w-32 text-xs">
            <option value="fr">français</option>
            <option value="en">anglais</option>
            <option value="ja">japonais</option>
          </NativeSelect>
        </label>
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={gallery}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {done && !photos.length && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gain/30 bg-gain/10 px-4 py-3 text-sm">
          <CheckCircle2 className="size-4 text-gain" />
          <span className="flex-1">{done}.</span>
          <Link href="/collection" className={buttonVariants({ size: "sm", variant: "outline" })}>
            Voir ma collection
          </Link>
        </div>
      )}

      {photos.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {photos.map((p) => (
            <div key={p.id} className="relative w-28 shrink-0 overflow-hidden rounded-lg border bg-muted">
              {p.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:)
                <img src={p.url} alt="Photo analysée" className="aspect-[3/4] w-full object-cover" />
              ) : (
                <div className="aspect-[3/4] w-full" />
              )}
              <div className="absolute inset-x-0 bottom-0 bg-black/70 px-1.5 py-1 text-[11px] text-white backdrop-blur">
                {p.status === "preparing" || p.status === "analyzing" ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="size-3 animate-spin" />
                    {p.status === "preparing" ? "Préparation" : p.progress != null ? `Lecture ${Math.round(p.progress * 100)} %` : "Analyse…"}
                  </span>
                ) : p.status === "error" ? (
                  <span className="flex items-center gap-1 text-red-300" title={p.error ?? undefined}>
                    <AlertCircle className="size-3 shrink-0" /> <span className="truncate">{p.error}</span>
                  </span>
                ) : (
                  <span>
                    {p.found} carte{p.found > 1 ? "s" : ""} reconnue{p.found > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => removePhoto(p.id)}
                className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                aria-label="Retirer la photo et ses cartes"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {(rows.length > 0 || (photos.length > 0 && !busy)) && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Cartes détectées ({rows.length})
            </h2>
            {!adding && (
              <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
                <Plus />
                Ajouter une carte
              </Button>
            )}
          </div>
          {!rows.length && (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              Aucune carte reconnue sur ces photos. Réessayez avec une photo plus nette (numéros lisibles, sans reflet) ou ajoutez les
              cartes à la main.
            </p>
          )}
          {adding && (
            <div className="space-y-2 rounded-xl border border-dashed p-3">
              <div className="flex items-center justify-between text-sm font-medium">
                Ajouter une carte à la main
                <button type="button" onClick={() => setAdding(false)} className="text-muted-foreground hover:text-foreground" aria-label="Fermer">
                  <X className="size-4" />
                </button>
              </div>
              <CardSearch
                lang={lang}
                onPick={(c) => {
                  setRows((rs) => [...rs, manualRow(c, nextId())]);
                  setAdding(false);
                }}
              />
            </div>
          )}
          {rows.map((row) => (
            <DetectionRow
              key={row.key}
              row={row}
              lang={lang}
              onChange={(update) => setRows((rs) => rs.map((r) => (r.key === row.key ? update(r) : r)))}
              onRemove={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
            />
          ))}
        </section>
      )}

      {rows.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 px-4 py-3 backdrop-blur-md lg:left-60 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1 text-sm">
              <span className="font-medium">
                {count} carte{count > 1 ? "s" : ""} à ajouter
              </span>
              <span className="text-muted-foreground">
                {" "}
                · achat <span className="num">{eur(totalCost)}</span> · cote <span className="num">{eur(totalValue)}</span>
              </span>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Achetées le
              <Input type="date" value={purchaseDate} max={today} onChange={(e) => setPurchaseDate(e.target.value)} className="h-8 w-36" />
            </label>
            <Button onClick={submit} disabled={pending || busy || !count}>
              {pending && <Loader2 className="animate-spin" />}
              Ajouter à ma collection
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
