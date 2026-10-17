import { and, eq, inArray, or } from "drizzle-orm";
import { type CollectionItem, type TradeCard, tradeMatches } from "./collection";
import { importHoldingsOnce, itemColumns, loadCollectionItems } from "./collection-db";
import { getDb, schema } from "./db";

// Amis et échanges. Une ligne de `friendships` = « user a ajouté friend » ; on ne lit la collection d'un
// compte que s'il est un ami mutuel (chacun a ajouté l'autre).

const f = schema.friendships;
const u = schema.users;

export interface Friend {
  id: string;
  username: string;
}

export interface FriendLists {
  /** Ajout réciproque : collections comparées. */
  mutual: Friend[];
  /** Ils vous ont ajouté, pas encore vous. */
  incoming: Friend[];
  /** Vous les avez ajoutés, en attente de leur ajout. */
  outgoing: Friend[];
}

export type AddFriendResult = { ok: true; friend: Friend; mutual: boolean } | { ok: false; message: string };

export async function addFriendByUsername(userId: string, username: string): Promise<AddFriendResult> {
  const db = await getDb();
  const [friend] = await db.select({ id: u.id, username: u.username }).from(u).where(eq(u.username, username.trim().toLowerCase()));
  if (!friend) return { ok: false, message: "Aucun compte avec ce pseudo" };
  if (friend.id === userId) return { ok: false, message: "C'est votre propre pseudo" };
  await db.insert(f).values({ userId, friendId: friend.id }).onConflictDoNothing();
  const [back] = await db.select({ id: f.userId }).from(f).where(and(eq(f.userId, friend.id), eq(f.friendId, userId)));
  return { ok: true, friend, mutual: Boolean(back) };
}

/** Ajout en retour d'un compte qui vous a ajouté (sans demande de sa part, rien n'est créé). */
export async function acceptFriend(userId: string, friendId: string): Promise<boolean> {
  const db = await getDb();
  const [incoming] = await db.select({ id: f.userId }).from(f).where(and(eq(f.userId, friendId), eq(f.friendId, userId)));
  if (!incoming) return false;
  await db.insert(f).values({ userId, friendId }).onConflictDoNothing();
  return true;
}

/** Retire un ami, ou refuse une demande : les deux sens disparaissent, pour une séparation nette. */
export async function removeFriend(userId: string, friendId: string): Promise<void> {
  const db = await getDb();
  await db.delete(f).where(or(and(eq(f.userId, userId), eq(f.friendId, friendId)), and(eq(f.userId, friendId), eq(f.friendId, userId))));
}

export async function listFriends(userId: string): Promise<FriendLists> {
  const db = await getDb();
  const [added, addedMe] = await Promise.all([
    db.select({ id: u.id, username: u.username }).from(f).innerJoin(u, eq(u.id, f.friendId)).where(eq(f.userId, userId)),
    db.select({ id: u.id, username: u.username }).from(f).innerJoin(u, eq(u.id, f.userId)).where(eq(f.friendId, userId)),
  ]);
  const byName = (a: Friend, b: Friend) => a.username.localeCompare(b.username, "fr");
  const back = new Set(addedMe.map((x) => x.id));
  const mine = new Set(added.map((x) => x.id));
  return {
    mutual: added.filter((x) => back.has(x.id)).sort(byName),
    incoming: addedMe.filter((x) => !mine.has(x.id)).sort(byName),
    outgoing: added.filter((x) => !back.has(x.id)).sort(byName),
  };
}

/** Collections des amis mutuels, et seulement d'eux. */
export async function loadFriendCollections(userId: string): Promise<{ friends: FriendLists; collections: Map<string, CollectionItem[]> }> {
  const friends = await listFriends(userId);
  const ids = friends.mutual.map((x) => x.id);
  const collections = new Map<string, CollectionItem[]>(ids.map((id) => [id, []]));
  if (!ids.length) return { friends, collections };

  // Un ami qui n'a jamais ouvert la checklist a peut-être encore ses cartes dans le portefeuille.
  await Promise.all(ids.map((id) => importHoldingsOnce(id)));
  const db = await getDb();
  const t = schema.collectionItems;
  const rows = await db
    .select({ owner: t.userId, ...itemColumns })
    .from(t)
    .where(inArray(t.userId, ids));
  for (const { owner, ...item } of rows) collections.get(owner)?.push(item);
  return { friends, collections };
}

export interface FriendTrades {
  friend: Friend;
  /** Ses doubles qui vous manquent. */
  forMe: TradeCard[];
  /** Vos doubles qui lui manquent. */
  forThem: TradeCard[];
}

/** Échanges possibles avec chaque ami mutuel, dans les deux sens. */
export async function loadTrades(userId: string): Promise<{ friends: FriendLists; trades: FriendTrades[] }> {
  const [{ friends, collections }, mine] = await Promise.all([loadFriendCollections(userId), loadCollectionItems(userId)]);
  const trades = friends.mutual.map((friend) => {
    const theirs = collections.get(friend.id) ?? [];
    return { friend, forMe: tradeMatches(theirs, mine), forThem: tradeMatches(mine, theirs) };
  });
  return { friends, trades };
}
