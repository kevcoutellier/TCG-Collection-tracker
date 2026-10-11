"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <div className="rounded-full bg-loss/15 p-3 text-loss">
        <TriangleAlert className="size-6" />
      </div>
      <h1 className="mt-4 text-xl font-semibold">Impossible de charger cette page</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        La source de prix (TCGdex) est peut-être momentanément indisponible. Réessayez dans quelques instants.
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-muted-foreground">Réf. {error.digest}</p>}
      <Button className="mt-6" onClick={reset}>
        <RotateCcw />
        Réessayer
      </Button>
    </div>
  );
}
