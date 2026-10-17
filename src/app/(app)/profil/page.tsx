import { eq } from "drizzle-orm";
import { ChevronRight, LogOut } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { logout } from "@/app/auth-actions";
import { InstallHint } from "@/components/install-hint";
import { INVESTMENT_NAV } from "@/components/nav-items";
import { SectionTitle } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { loadCollectionOverview } from "@/lib/collection-overview";
import { getDb, schema } from "@/lib/db";

export const metadata: Metadata = { title: "Profil" };

const int = new Intl.NumberFormat("fr-FR");
const monthYear = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });

export default function ProfilePage() {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileContent />
    </Suspense>
  );
}

async function ProfileContent() {
  const user = await requireUser();
  const db = await getDb();
  const [[account], { totals, sets, completed }] = await Promise.all([
    db.select({ createdAt: schema.users.createdAt }).from(schema.users).where(eq(schema.users.id, user.id)),
    loadCollectionOverview(user.id),
  ]);

  return (
    <div className="space-y-8">
      <header className="flex items-center gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary text-2xl font-semibold text-primary-foreground uppercase">
          {user.username.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{user.username}</h1>
          {account && <p className="text-sm text-muted-foreground">Membre depuis {monthYear.format(account.createdAt)}</p>}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cartes" value={int.format(totals.copies)} />
        <Stat label="Différentes" value={int.format(totals.unique)} />
        <Stat label="Doubles" value={int.format(totals.doubles)} sub="à échanger" />
        <Stat label="Extensions" value={sets.length} sub={`${completed} complète${completed > 1 ? "s" : ""}`} />
      </div>

      <InstallHint />

      <section>
        <SectionTitle>Investissement</SectionTitle>
        <p className="mb-3 text-sm text-muted-foreground">
          Prix d&apos;achat, valeur et plus-values de vos cartes, gradées et produits scellés, suivis à part de la collection.
        </p>
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {INVESTMENT_NAV.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className="flex min-h-12 items-center gap-3 px-4 text-sm transition-colors hover:bg-accent/40">
                <Icon className="size-4 text-muted-foreground" />
                <span className="flex-1">{label}</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <form action={logout}>
        <Button type="submit" variant="outline" size="lg" className="w-full text-destructive sm:w-auto">
          <LogOut />
          Se déconnecter
        </Button>
      </form>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 rounded-full" />
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
