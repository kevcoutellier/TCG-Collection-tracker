"use client";

import { Loader2, LogOut } from "lucide-react";
import { useTransition } from "react";
import { logout } from "@/app/auth-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({ username }: { username: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-lg" className="shrink-0 rounded-full" aria-label={`Compte ${username}`} />}
      >
        {pending ? (
          <Loader2 className="animate-spin" />
        ) : (
          <span className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary uppercase ring-1 ring-primary/30">
            {username.slice(0, 1)}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Connecté en tant que</DropdownMenuLabel>
          <div className="truncate px-1.5 pb-1 text-sm font-medium">{username}</div>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await logout();
            })
          }
        >
          <LogOut />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
