"use client";

import { Download, Share } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Événement Chrome/Edge qui permet de déclencher l'installation depuis un bouton (absent de lib.dom). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

type Mode = "installed" | "ios" | "other";

const STANDALONE = "(display-mode: standalone)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(STANDALONE);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function currentMode(): Mode {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (window.matchMedia(STANDALONE).matches || iosStandalone) return "installed";
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ? "ios" : "other";
}

/** Invite à installer l'app sur l'écran d'accueil ; rien ne s'affiche une fois l'app installée. */
export function InstallHint({ className }: { className?: string }) {
  // Côté serveur, on ne sait pas : on n'affiche rien plutôt qu'un encart qui disparaîtrait au chargement.
  const mode = useSyncExternalStore(subscribe, currentMode, (): Mode => "installed");
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (mode === "installed") return null;
  return (
    <section className={cn("flex items-start gap-3 rounded-xl border bg-card p-4", className)}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
        {mode === "ios" ? <Share className="size-5" /> : <Download className="size-5" />}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <h2 className="font-medium">Installer PokéFolio sur votre téléphone</h2>
        <p className="text-sm text-muted-foreground text-pretty">
          {mode === "ios"
            ? "Dans Safari, touchez le bouton Partager puis « Sur l'écran d'accueil » : l'app s'ouvrira en plein écran, comme une application."
            : prompt
              ? "Ajoutez l'app à votre écran d'accueil pour l'ouvrir en plein écran, sans passer par le navigateur."
              : "Dans Chrome, ouvrez le menu ⋮ puis « Installer l'application » (ou « Ajouter à l'écran d'accueil »)."}
        </p>
        {prompt && (
          <Button
            className="mt-2"
            onClick={async () => {
              await prompt.prompt();
              setPrompt(null);
            }}
          >
            <Download />
            Installer l&apos;application
          </Button>
        )}
      </div>
    </section>
  );
}
