"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { acceptFriend, addFriendByUsername, removeFriend } from "@/lib/friends-db";
import type { ActionState } from "./actions";

const UNEXPECTED = "Une erreur est survenue, réessayez.";
const friendId = z.uuid();

export async function addFriend(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z.string().trim().min(1, "Pseudo requis").max(32).safeParse(formData.get("username"));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Pseudo invalide" };
  try {
    const res = await addFriendByUsername(user.id, parsed.data);
    if (!res.ok) return res;
    refresh();
    return {
      ok: true,
      message: res.mutual
        ? `Vous êtes maintenant amis avec ${res.friend.username}`
        : `Demande envoyée à ${res.friend.username} : vos collections seront comparées dès que ce compte vous ajoutera aussi.`,
    };
  } catch (e) {
    console.error(e);
    return { ok: false, message: UNEXPECTED };
  }
}

export async function acceptFriendRequest(id: string): Promise<NonNullable<ActionState>> {
  const user = await requireUser();
  if (!friendId.safeParse(id).success) return { ok: false, message: "Compte inconnu" };
  try {
    const ok = await acceptFriend(user.id, id);
    refresh();
    return ok ? { ok, message: "Ami ajouté" } : { ok, message: "Cette demande n'existe plus" };
  } catch (e) {
    console.error(e);
    return { ok: false, message: UNEXPECTED };
  }
}

/** Retire un ami, refuse une demande reçue ou annule une demande envoyée. */
export async function removeFriendship(id: string): Promise<NonNullable<ActionState>> {
  const user = await requireUser();
  if (!friendId.safeParse(id).success) return { ok: false, message: "Compte inconnu" };
  try {
    await removeFriend(user.id, id);
    refresh();
    return { ok: true, message: "C'est fait" };
  } catch (e) {
    console.error(e);
    return { ok: false, message: UNEXPECTED };
  }
}
