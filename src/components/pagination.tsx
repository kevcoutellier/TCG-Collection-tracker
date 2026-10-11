import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Pagination({ current, pages, href }: { current: number; pages: number; href: (page: number) => string }) {
  const around = [...new Set([1, current - 2, current - 1, current, current + 1, current + 2, pages])]
    .filter((p) => p >= 1 && p <= pages)
    .sort((a, b) => a - b);
  return (
    <nav className="flex flex-wrap items-center justify-center gap-1 pt-2" aria-label="Pagination">
      <Link
        href={href(Math.max(1, current - 1))}
        aria-disabled={current === 1}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), current === 1 && "pointer-events-none opacity-40")}
      >
        <ChevronLeft /> Préc.
      </Link>
      {around.map((p, i) => (
        <span key={p} className="flex items-center">
          {i > 0 && p - around[i - 1] > 1 && <span className="px-1 text-muted-foreground">…</span>}
          <Link
            href={href(p)}
            aria-current={p === current ? "page" : undefined}
            className={buttonVariants({ variant: p === current ? "secondary" : "ghost", size: "sm" })}
          >
            {p}
          </Link>
        </span>
      ))}
      <Link
        href={href(Math.min(pages, current + 1))}
        aria-disabled={current === pages}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), current === pages && "pointer-events-none opacity-40")}
      >
        Suiv. <ChevronRight />
      </Link>
    </nav>
  );
}
