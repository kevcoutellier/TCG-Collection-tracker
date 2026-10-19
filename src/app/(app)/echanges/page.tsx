import { ArrowLeftRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CardImage } from "@/components/card-image";
import { cardHref } from "@/components/card-tile";
import { AddFriendForm, FriendButton } from "@/components/forms/friend-forms";
import { EmptyState, PageHeader, SectionTitle } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import type { TradeCard } from "@/lib/collection";
import { type FriendTrades, loadTrades } from "@/lib/friends-db";
import { getCard } from "@/lib/tcgdex";
import type { CardDetail, Lang } from "@/lib/types";

export const metadata: Metadata = { title: "Échanges" };

/** Cartes affichées par liste ; au-delà, on indique le nombre restant. */
const SHOWN = 12;

const catalogLang = (lang: Lang) => (lang === "ja" ? "ja" : "fr");

export default function TradesPage() {
  return (
    <>
      <PageHeader
        title="Échanges"
        description="Ajoutez vos amis avec leur pseudo : PokéFolio repère leurs doubles qui vous manquent, et les vôtres qui leur manquent, dans les extensions que chacun a commencées."
      />
      <Suspense fallback={<TradesSkeleton />}>
        <TradesContent />
      </Suspense>
    </>
  );
}

async function TradesContent() {
  const user = await requireUser();
  const { friends, trades } = await loadTrades(user.id);

  const shown = new Map<string, TradeCard>();
  for (const t of trades) for (const c of [...t.forMe.slice(0, SHOWN), ...t.forThem.slice(0, SHOWN)]) shown.set(c.cardId, c);
  const details = await Promise.all([...shown.values()].map((c) => getCard(c.cardId, catalogLang(c.lang)).catch(() => null)));
  const cards = new Map(details.filter((c): c is CardDetail => c !== null).map((c) => [c.id, c]));
  const nobody = !friends.mutual.length && !friends.incoming.length && !friends.outgoing.length;

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <AddFriendForm />
        <p className="text-xs text-muted-foreground">
          Votre pseudo : <strong className="text-foreground">{user.username}</strong>. Votre collection n&apos;est comparée
          qu&apos;avec les amis que vous avez ajoutés et qui vous ont ajouté.
        </p>
      </section>

      {friends.incoming.length > 0 && (
        <section>
          <SectionTitle>Demandes reçues</SectionTitle>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {friends.incoming.map((friend) => (
              <li key={friend.id} className="flex flex-wrap items-center gap-3 p-3">
                <Avatar name={friend.username} />
                <span className="min-w-0 flex-1 text-sm">
                  <strong>{friend.username}</strong> vous a ajouté
                </span>
                <span className="flex gap-2">
                  <FriendButton friendId={friend.id} action="accept" variant="default">
                    Ajouter en retour
                  </FriendButton>
                  <FriendButton friendId={friend.id} action="remove" variant="ghost">
                    Ignorer
                  </FriendButton>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {trades.map((t) => (
        <FriendTradesCard key={t.friend.id} trades={t} cards={cards} />
      ))}

      {friends.outgoing.length > 0 && (
        <section>
          <SectionTitle>En attente</SectionTitle>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {friends.outgoing.map((friend) => (
              <li key={friend.id} className="flex items-center gap-3 p-3">
                <Avatar name={friend.username} />
                <span className="min-w-0 flex-1 text-sm text-muted-foreground">
                  <strong className="text-foreground">{friend.username}</strong> ne vous a pas encore ajouté
                </span>
                <FriendButton friendId={friend.id} action="remove" variant="ghost">
                  Annuler
                </FriendButton>
              </li>
            ))}
          </ul>
        </section>
      )}

      {nobody && (
        <EmptyState
          icon={<ArrowLeftRight />}
          title="Aucun ami pour l'instant"
          description="Ajoutez le pseudo d'un ami ci-dessus et donnez-lui le vôtre : dès que chacun a ajouté l'autre, vos doubles et vos cartes manquantes sont comparés."
        />
      )}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary uppercase ring-1 ring-primary/30">
      {name.slice(0, 1)}
    </span>
  );
}

function FriendTradesCard({ trades, cards }: { trades: FriendTrades; cards: Map<string, CardDetail> }) {
  const { friend, forMe, forThem } = trades;
  return (
    <section className="space-y-5 rounded-xl border bg-card p-4 sm:p-5">
      <header className="flex items-center gap-3">
        <Avatar name={friend.username} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{friend.username}</h2>
          <p className="text-sm text-muted-foreground">
            {forMe.length} carte{forMe.length > 1 ? "s" : ""} pour vous · {forThem.length} pour {friend.username}
          </p>
        </div>
        <FriendButton friendId={friend.id} action="remove" variant="ghost">
          Retirer
        </FriendButton>
      </header>
      <TradeList title="Ses doubles qui vous manquent" items={forMe} cards={cards} />
      <TradeList title="Vos doubles qui lui manquent" items={forThem} cards={cards} />
    </section>
  );
}

function TradeList({ title, items, cards }: { title: string; items: TradeCard[]; cards: Map<string, CardDetail> }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {items.length ? (
        <>
          <ul className="grid grid-cols-4 gap-2.5 sm:grid-cols-6 lg:grid-cols-8">
            {items.slice(0, SHOWN).map((item) => {
              const card = cards.get(item.cardId);
              return (
                <li key={item.cardId} className="min-w-0">
                  <Link href={cardHref(item.cardId, catalogLang(item.lang))} className="block space-y-1">
                    <span className="relative block">
                      <CardImage src={card?.image} alt="" />
                      {item.spare > 1 && (
                        <span className="num absolute bottom-1 left-1 rounded bg-black/75 px-1 text-[10px] font-semibold text-white">×{item.spare}</span>
                      )}
                    </span>
                    <span className="block truncate text-xs font-medium">{card?.name ?? item.cardId}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {items.length > SHOWN && <p className="mt-2 text-xs text-muted-foreground">et {items.length - SHOWN} autres</p>}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Aucune pour l&apos;instant, dans les extensions en cours.</p>
      )}
    </div>
  );
}

function TradesSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-11 rounded-lg" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
