"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PokeballMark } from "@/components/card-image";
import { COLLECTION_NAV, INVESTMENT_NAV } from "@/components/nav-items";
import { cn } from "@/lib/utils";

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`) || (href === "/recherche" && pathname.startsWith("/cartes"));
}

function NavGroup({ items, pathname }: { items: typeof COLLECTION_NAV | typeof INVESTMENT_NAV; pathname: string | null }) {
  return items.map(({ href, label, icon: Icon }) => {
    const active = isActive(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
          active && "bg-sidebar-accent font-semibold text-primary hover:text-primary",
        )}
      >
        <Icon className={cn("size-4", active ? "text-primary" : "text-muted-foreground")} />
        {label}
      </Link>
    );
  });
}

export function NavLinks({ pathname = null }: { pathname?: string | null }) {
  return (
    <nav className="grid gap-0.5">
      <NavGroup items={COLLECTION_NAV} pathname={pathname} />
      <div className="mt-5 mb-1 px-3 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Investissement</div>
      <NavGroup items={INVESTMENT_NAV} pathname={pathname} />
    </nav>
  );
}

export function ActiveNavLinks() {
  return <NavLinks pathname={usePathname()} />;
}

/** Logo et nom de l'app ; `inverse` : en blanc, pour l'en-tête rouge. */
export function Brand({ className, inverse = false }: { className?: string; inverse?: boolean }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 tracking-tight", className)}>
      <PokeballMark className="size-8 shrink-0 drop-shadow-sm" />
      <span className={cn("text-lg font-bold", inverse ? "text-primary-foreground" : "text-foreground")}>
        Poké<span className={inverse ? "font-semibold text-primary-foreground/85" : "text-primary"}>Folio</span>
      </span>
    </Link>
  );
}

/** Barre d'onglets fixée en bas de l'écran sur mobile, au-dessus de la barre d'accueil de l'iPhone. */
export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-sidebar/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(0_0_0/5%)] backdrop-blur-md lg:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 px-1 pt-1.5 pb-1">
        {COLLECTION_NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active && "font-semibold text-primary",
              )}
            >
              <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-accent")}>
                <Icon className="size-5" />
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
