"use client";

import { Loader2, UserPlus } from "lucide-react";
import { type ReactNode, useActionState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionState } from "@/app/actions";
import { acceptFriendRequest, addFriend, removeFriendship } from "@/app/friend-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AddFriendForm() {
  const [, formAction, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const res = await addFriend(prev, fd);
    if (res?.ok) toast.success(res.message);
    else if (res) toast.error(res.message);
    return res;
  }, null);
  return (
    <form action={formAction} className="flex gap-2">
      <Input
        name="username"
        placeholder="Pseudo de votre ami"
        aria-label="Pseudo de votre ami"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={32}
        required
        className="h-11 flex-1"
      />
      <Button type="submit" size="lg" className="h-11" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <UserPlus />}
        Ajouter
      </Button>
    </form>
  );
}

/** Bouton d'action sur un ami : accepter une demande, la refuser, l'annuler ou retirer l'ami. */
export function FriendButton({
  friendId,
  action,
  variant = "outline",
  children,
}: {
  friendId: string;
  action: "accept" | "remove";
  variant?: "default" | "outline" | "ghost";
  children: ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant={variant}
      disabled={pending}
      className="min-h-10"
      onClick={() =>
        startTransition(async () => {
          const res = await (action === "accept" ? acceptFriendRequest : removeFriendship)(friendId);
          if (res.ok) toast.success(res.message);
          else toast.error(res.message);
        })
      }
    >
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}
