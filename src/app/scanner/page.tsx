import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { CardScanner } from "@/components/scanner/card-scanner";
import { Skeleton } from "@/components/ui/skeleton";
import { todayISO } from "@/lib/format";
import { visionConfigured } from "@/lib/vision";

export const metadata: Metadata = { title: "Scanner" };

export default function ScannerPage() {
  return (
    <>
      <PageHeader
        eyebrow="Scanner"
        title="Scanner des cartes"
        description="Photographiez une ou plusieurs cartes : elles sont reconnues, cotées et ajoutées à votre collection en une fois, après votre vérification."
      />
      <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
        <ScannerLoader />
      </Suspense>
    </>
  );
}

async function ScannerLoader() {
  // Configuration lue à l'exécution (clé API) et date du jour : rendu à la requête.
  await connection();
  return <CardScanner engine={visionConfigured() ? "vision" : "ocr"} today={todayISO()} />;
}
