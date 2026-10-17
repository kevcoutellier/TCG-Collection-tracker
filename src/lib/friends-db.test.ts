import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setItemQuantity } from "./collection-db";
import { getDb, schema } from "./db";
import { acceptFriend, addFriendByUsername, listFriends, loadFriendCollections, removeFriend } from "./friends-db";

// Base PGlite jetable : les règles d'accès aux collections sont vérifiées sur de vraies requêtes.
let dir: string;
const ids: Record<string, string> = {};

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "pokefolio-friends-"));
  process.env.PGLITE_DIR = dir;
  const db = await getDb();
  for (const username of ["sacha", "lea", "hugo"]) {
    [{ id: ids[username] }] = await db.insert(schema.users).values({ username, passwordHash: "x" }).returning({ id: schema.users.id });
  }
  await setItemQuantity(ids.lea, { cardId: "sv03.5-006", lang: "fr", setId: "sv03.5", variant: "normal", quantity: 2 });
  await setItemQuantity(ids.hugo, { cardId: "sv03.5-009", lang: "fr", setId: "sv03.5", variant: "normal", quantity: 3 });
}, 60_000);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("amis", () => {
  it("refuse un pseudo inconnu ou le sien", async () => {
    expect(await addFriendByUsername(ids.sacha, "inconnu")).toEqual({ ok: false, message: "Aucun compte avec ce pseudo" });
    expect(await addFriendByUsername(ids.sacha, "Sacha ")).toEqual({ ok: false, message: "C'est votre propre pseudo" });
  });

  it("une demande reste en attente tant qu'elle n'est pas réciproque", async () => {
    expect(await addFriendByUsername(ids.sacha, "LEA")).toMatchObject({ ok: true, mutual: false });
    expect(await listFriends(ids.sacha)).toMatchObject({ mutual: [], outgoing: [{ username: "lea" }], incoming: [] });
    expect(await listFriends(ids.lea)).toMatchObject({ mutual: [], incoming: [{ username: "sacha" }] });
    // Pas encore ami mutuel : la collection de Léa reste invisible.
    expect((await loadFriendCollections(ids.sacha)).collections.size).toBe(0);
  });

  it("l'ajout en retour rend l'amitié mutuelle et ouvre les collections", async () => {
    expect(await acceptFriend(ids.lea, ids.sacha)).toBe(true);
    const { friends, collections } = await loadFriendCollections(ids.sacha);
    expect(friends.mutual.map((x) => x.username)).toEqual(["lea"]);
    expect([...collections.keys()]).toEqual([ids.lea]);
    expect(collections.get(ids.lea)).toEqual([{ cardId: "sv03.5-006", lang: "fr", setId: "sv03.5", variant: "normal", quantity: 2 }]);
  });

  it("on ne peut pas « accepter » quelqu'un qui ne vous a pas ajouté", async () => {
    expect(await acceptFriend(ids.sacha, ids.hugo)).toBe(false);
    expect((await listFriends(ids.sacha)).outgoing).toEqual([]);
  });

  it("retirer un ami supprime les deux sens", async () => {
    await removeFriend(ids.sacha, ids.lea);
    expect(await listFriends(ids.sacha)).toEqual({ mutual: [], incoming: [], outgoing: [] });
    expect(await listFriends(ids.lea)).toEqual({ mutual: [], incoming: [], outgoing: [] });
  });
});
