import Link from "next/link";
import { PokeballIcon } from "@/components/card-image";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <PokeballIcon className="size-12 text-muted-foreground" />
      <h1 className="mt-4 text-xl font-semibold">Introuvable</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Cette carte ou cette extension n&apos;existe pas (ou plus) dans la base TCGdex.
      </p>
      <Link href="/recherche" className={buttonVariants({ className: "mt-6" })}>
        Lancer une recherche
      </Link>
    </div>
  );
}
