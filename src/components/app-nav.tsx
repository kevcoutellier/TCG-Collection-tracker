"use client";

import {
  BrainCircuit,
  Eye,
  House,
  Layers,
  LayoutDashboard,
  Library,
  Menu,
  Search,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PokeballIcon } from "@/components/card-image";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/sets", label: "Extensions", icon: Library },
  { href: "/recherche", label: "Recherche", icon: Search },
  { href: "/collection", label: "Portefeuille", icon: Layers },
  { href: "/watchlist", label: "Watchlist", icon: Eye },
  { href: "/analyse", label: "Analyse & stratégie", icon: BrainCircuit },
  { href: "/marche", label: "Marché", icon: TrendingUp },
] as const;

/** Onglets de la barre du bas sur mobile ; le reste du menu s'ouvre depuis « Plus ». */
const TABS = [
  { href: "/", label: "Accueil", icon: House },
  { href: "/sets", label: "Extensions", icon: Library },
  { href: "/recherche", label: "Rechercher", icon: Search },
] as const;

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`) || (href === "/recherche" && pathname.startsWith("/cartes"));
}

export function NavLinks({ onNavigate, pathname = null }: { onNavigate?: () => void; pathname?: string | null }) {
  return (
    <nav className="grid gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
              active && "bg-sidebar-accent font-medium text-sidebar-foreground",
            )}
          >
            <Icon className={cn("size-4", active && "text-primary")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function ActiveNavLinks() {
  return <NavLinks pathname={usePathname()} />;
}

export function Brand({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <PokeballIcon className="size-5" />
      </span>
      <span className="text-base">
        Poké<span className="text-primary">Folio</span>
      </span>
    </Link>
  );
}

const tabClass = (active: boolean) =>
  cn(
    "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    active && "text-foreground",
  );

/** Barre d'onglets fixée en bas de l'écran sur mobile, au-dessus de la barre d'accueil de l'iPhone. */
export function MobileTabBar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-4 px-2 pt-1.5 pb-1">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={tabClass(active)}>
              <Icon className={cn("size-5", active && "text-primary")} />
              {label}
            </Link>
          );
        })}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={<button type="button" className={tabClass(false)} />}>
            <Menu className="size-5" />
            Plus
          </SheetTrigger>
          <SheetContent side="left" className="w-72 bg-sidebar p-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Brand className="mb-4 px-1" />
            <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
