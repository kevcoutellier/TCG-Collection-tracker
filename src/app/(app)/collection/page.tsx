import { Download, Layers, Library, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { Suspense } from "react";
import { MoneyDelta } from "@/components/delta";
import { AddSealedDialog } from "@/components/forms/holding-forms";
import { RefreshPricesButton } from "@/components/forms/watch-forms";
import { EmptyState, PageHeader } from "@/components/page-header";
import { PositionsTable, SalesTable } from "@/components/portfolio-tables";
import { Stat } from "@/components/stat";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { eur, pctText, todayISO } from "@/lib/format";
import { loadPortfolio } from "@/lib/portfolio";
import { refreshIfStale } from "@/lib/snapshots";

export const metadata: Metadata = { title: "Portefeuille" };

export default function CollectionPage() {
  return (
    <Suspense fallback={<CollectionSkeleton />}>
      <CollectionContent />
    </Suspense>
  );
}

async function CollectionContent() {
  const { positions, sold, summary } = await loadPortfolio();
  const today = todayISO();
  after(() => refreshIfStale().catch(() => {}));

  const actions = (
    <>
      <Link href="/sets" className={buttonVariants()}>
        <Library />
        Par extension
      </Link>
      <Link href="/recherche" className={buttonVariants({ variant: "outline" })}>
        <Search />
        Carte
      </Link>
      <AddSealedDialog today={today} />
      <RefreshPricesButton />
      <a href="/api/export" className={buttonVariants({ variant: "ghost" })} download>
        <Download />
        CSV
      </a>
    </>
  );

  if (!positions.length && !sold.length) {
    return (
      <>
        <PageHeader title="Portefeuille" description="Vos cartes, cartes gradées et produits scellés, valorisés au prix du marché." />
        <EmptyState
          icon={<Layers />}
          title="Votre portefeuille est vide"
          description="Ouvrez une extension et touchez le nom d'une carte pour l'ajouter avec son prix d'achat, recherchez une carte, ou enregistrez un produit scellé (display, ETB…)."
        >
          <Link href="/sets" className={buttonVariants()}>
            <Library />
            Parcourir les extensions
          </Link>
          <Link href="/recherche" className={buttonVariants({ variant: "outline" })}>
            <Search />
            Rechercher une carte
          </Link>
          <AddSealedDialog today={today} />
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Portefeuille"
        description={`${summary.itemCount} objet${summary.itemCount > 1 ? "s" : ""} en ${summary.positionCount} ligne${summary.positionCount > 1 ? "s" : ""}, valorisé${summary.itemCount > 1 ? "s" : ""} à la cote du jour.`}
        actions={actions}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Valeur actuelle" value={eur(summary.totalValue, { compact: true })} accent />
        <Stat label="Investi" value={eur(summary.totalCost, { compact: true })} />
        <Stat
          label="Plus-value latente"
          value={<MoneyDelta value={summary.unrealized} />}
          sub={pctText(summary.unrealizedPct)}
        />
        <Stat
          label="Plus-value réalisée"
          value={<MoneyDelta value={summary.realized} />}
          sub={sold.length ? `${sold.length} vente${sold.length > 1 ? "s" : ""} · ${pctText(summary.realizedPct)}` : "Aucune vente"}
        />
      </div>

      <Tabs defaultValue="open">
        <TabsList>
          <TabsTrigger value="open">En portefeuille ({positions.length})</TabsTrigger>
          <TabsTrigger value="sold">Ventes ({sold.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="open" className="mt-4">
          {positions.length ? (
            <PositionsTable positions={positions} today={today} />
          ) : (
            <EmptyState title="Tout a été vendu" description="Ajoutez de nouvelles cartes depuis la recherche." />
          )}
        </TabsContent>
        <TabsContent value="sold" className="mt-4">
          {sold.length ? (
            <SalesTable sold={sold} />
          ) : (
            <EmptyState
              title="Aucune vente enregistrée"
              description="Utilisez l'icône étiquette d'une ligne pour enregistrer une vente (totale ou partielle) et suivre vos plus-values réalisées."
            />
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

function CollectionSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-56" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}
