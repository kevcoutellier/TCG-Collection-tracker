"use client";

import { Anybody } from "next/font/google";
import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { createParticleEngine, type ParticleEngine } from "./particles";
import "./gate.css";

// Police variable très étirable (wdth 50→150, wght 100→900) : c'est elle qui « respire » à l'apparition du titre.
// Pas de préchargement : seuls les visiteurs qui voient la gate la téléchargent.
const display = Anybody({ subsets: ["latin"], axes: ["wdth"], variable: "--font-gate", preload: false });

const STORAGE_KEY = "pokefolio:gate";
const REPLAY_EVENT = "pokefolio:gate-replay";

/** Timeline de l'intro, en ms depuis son lancement. Les mêmes valeurs pilotent les délais CSS (`--t-*`). */
const T = {
  converge: 120,
  draw: 650,
  fill: 1300,
  armed: 1700,
  shake: 1950, // 3 secousses de 650 ms
  click: 3950,
  title: 4150,
  cards: 4250,
  ready: 4950,
};
/** Séquence d'ouverture, en ms depuis le clic. */
const OPEN = { explode: 300, reveal: 1150 };
const FADE_OUT = 650;

const TIMELINE_VARS = Object.fromEntries(
  Object.entries(T).map(([key, ms]) => [`--t-${key}`, `${ms}ms`]),
) as CSSProperties;

type Phase = "off" | "pre" | "intro" | "ready" | "opening" | "reveal";

const TCGDEX = "https://assets.tcgdex.net/fr";

/**
 * Cartes distribuées autour de la Ball. x/y : position desktop (vw/vh), mx/my : mobile,
 * z : profondeur (px), d : amplitude de parallaxe, blur : profondeur de champ.
 */
const CARDS = [
  { src: "sv/sv03.5/199", x: -28, y: -2, mx: -31, my: -31, z: 160, r: -9, ry: 18, d: 1.3, blur: 0 },
  { src: "sv/sv03.5/205", x: 30, y: 0, mx: 33, my: -33, z: 100, r: 8, ry: -18, d: 1.1, blur: 0 },
  { src: "swsh/swsh7/215", x: -35, y: 38, mx: -42, my: 42, z: -200, r: 7, ry: 12, d: 0.7, blur: 0.6 },
  { src: "swsh/swsh7/218", x: 36, y: 40, mx: 44, my: 44, z: -240, r: -8, ry: -12, d: 0.65, blur: 0.8 },
  { src: "swsh/swsh12/186", x: -35, y: -43, mx: 0, my: 0, z: -500, r: -5, ry: 8, d: 0.35, blur: 2.2 },
  { src: "swsh/swsh8/271", x: 36, y: -44, mx: 0, my: 0, z: -460, r: 6, ry: -8, d: 0.4, blur: 2 },
];

/** Étoiles du « clic » de capture : direction en multiples de la taille de la Ball. */
const STARS = [
  { sx: -0.62, sy: -0.62, rot: -160, s: 1 },
  { sx: 0.04, sy: -0.95, rot: 200, s: 1.15 },
  { sx: 0.66, sy: -0.58, rot: 170, s: 1 },
  { sx: -0.98, sy: -0.08, rot: -120, s: 0.6 },
  { sx: 0.98, sy: -0.16, rot: 140, s: 0.6 },
];

const TITLE = [..."PokéFolio"];

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Relance l'intro (bouton « Revoir l'intro »). */
export function replayGate() {
  window.dispatchEvent(new Event(REPLAY_EVENT));
}

/**
 * Gate d'entrée : la Poké Ball se matérialise, capture, puis s'ouvre sur le site.
 * Affichée une fois par session ; le script inline du layout la masque avant le premier rendu si déjà vue.
 */
export function PokeballGate() {
  const [phase, setPhase] = useState<Phase>("pre");
  const [armed, setArmed] = useState(false);
  const [opened, setOpened] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const ballRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ParticleEngine | null>(null);
  const timersRef = useRef(new Set<number>());
  const active = phase !== "off";

  function schedule(fn: () => void, ms: number) {
    const id = window.setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
  }

  function clearTimers() {
    for (const id of timersRef.current) clearTimeout(id);
    timersRef.current.clear();
  }

  function finish() {
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {}
    document.documentElement.dataset.gate = "off";
    setPhase("off");
    setArmed(false);
    setOpened(false);
  }

  function reveal() {
    document.documentElement.dataset.gate = "reveal";
    setPhase("reveal");
    schedule(finish, FADE_OUT);
  }

  function open() {
    if (!armed || phase === "opening" || phase === "reveal") return;
    clearTimers();
    if (prefersReducedMotion()) return reveal();
    const root = rootRef.current;
    const ball = ballRef.current?.getBoundingClientRect();
    if (root && ball) {
      root.style.setProperty("--bx", `${ball.left + ball.width / 2}px`);
      root.style.setProperty("--by", `${ball.top + ball.height / 2}px`);
    }
    setOpened(true);
    setPhase("opening");
    schedule(() => engineRef.current?.explode(), OPEN.explode);
    schedule(reveal, OPEN.reveal);
  }

  function skip() {
    if (phase === "reveal") return;
    clearTimers();
    reveal();
  }

  const begin = useEffectEvent(() => {
    clearTimers();
    document.documentElement.dataset.gate = "on";
    rootRef.current?.focus({ preventScroll: true });
    if (prefersReducedMotion()) {
      setArmed(true);
      setPhase("ready");
      return;
    }
    setArmed(false);
    setPhase("intro");
    schedule(() => engineRef.current?.converge(T.draw + 350 - T.converge), T.converge);
    schedule(() => setArmed(true), T.armed);
    schedule(() => engineRef.current?.burst(), T.click);
    schedule(() => setPhase("ready"), T.ready);
  });

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === "Escape") skip();
    else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) open();
  });

  // Démarrage (ou non) au montage, et relance à la demande.
  useEffect(() => {
    const html = document.documentElement;
    const timers = timersRef.current;
    const raf = requestAnimationFrame(() => (html.dataset.gate === "off" ? setPhase("off") : begin()));
    const onReplay = () => {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {}
      html.dataset.gate = "on";
      setPhase("pre");
      // Deux frames : la gate est remontée dans son état initial avant que l'intro ne démarre.
      requestAnimationFrame(() => requestAnimationFrame(() => begin()));
    };
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener(REPLAY_EVENT, onReplay);
      for (const id of timers) clearTimeout(id);
    };
  }, []);

  // Pendant la gate : le site dessous est inerte et le clavier pilote la Ball.
  useEffect(() => {
    if (!active || document.documentElement.dataset.gate === "off") return;
    const shell = document.querySelector<HTMLElement>("[data-app-shell]");
    shell?.setAttribute("inert", "");
    const handler = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", handler);
    return () => {
      shell?.removeAttribute("inert");
      window.removeEventListener("keydown", handler);
    };
  }, [active]);

  // Particules + parallaxe : une boucle lisse la position du pointeur et l'expose en variables CSS.
  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!active || !root || !canvas || prefersReducedMotion()) return;
    if (document.documentElement.dataset.gate === "off") return;
    const engine = createParticleEngine(canvas);
    engineRef.current = engine;
    let target = { x: 0, y: 0 };
    let current = { x: 0, y: 0 };
    let lastMove = -Infinity;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      target = { x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 };
      lastMove = performance.now();
      engine.setPointer(e.clientX, e.clientY);
    };
    const onLeave = () => engine.setPointer(null, null);
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      // Sans souris (tactile, ou souris immobile), la scène dérive seule en Lissajous pour rester vivante.
      if (now - lastMove > 2500) target = { x: Math.sin(now / 2600) * 0.35, y: Math.cos(now / 3400) * 0.25 };
      current = { x: current.x + (target.x - current.x) * 0.06, y: current.y + (target.y - current.y) * 0.06 };
      root.style.setProperty("--px", current.x.toFixed(4));
      root.style.setProperty("--py", current.y.toFixed(4));
      const ball = ballRef.current?.getBoundingClientRect();
      if (ball) engine.setFocus(ball.left + ball.width / 2, ball.top + ball.height / 2, ball.width / 2);
    };

    window.addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("pointerleave", onLeave);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      engine.destroy();
      engineRef.current = null;
    };
  }, [active]);

  if (!active) return null;

  return (
    <div
      ref={rootRef}
      className={cn("pg-root", display.variable)}
      data-gate-root=""
      data-phase={phase}
      data-armed={armed ? "" : undefined}
      data-opened={opened ? "" : undefined}
      role="dialog"
      aria-modal="true"
      aria-label="Bienvenue sur PokéFolio"
      tabIndex={-1}
      style={TIMELINE_VARS}
    >
      <BallGradients />

      {phase !== "pre" && (
        <div className="pg-cards" aria-hidden>
          {CARDS.map((c, i) => (
            <div
              key={c.src}
              className="pg-card"
              style={
                {
                  "--i": i,
                  "--x": `${c.x}vw`,
                  "--y": `${c.y}vh`,
                  "--mx": `${c.mx}vw`,
                  "--my": `${c.my}vh`,
                  "--z": `${c.z}px`,
                  "--r": `${c.r}deg`,
                  "--ry": `${c.ry}deg`,
                  "--d": c.d,
                  "--blur": `${c.blur}px`,
                } as CSSProperties
              }
            >
              <div className="pg-card-fly">
                <div className="pg-card-float">
                  <div className="pg-face pg-face-front">
                    {/* eslint-disable-next-line @next/next/no-img-element -- visuels TCGdex déjà servis en WebP */}
                    <img src={`${TCGDEX}/${c.src}/high.webp`} alt="" decoding="async" draggable={false} />
                    <span className="pg-foil" />
                    <span className="pg-glare" />
                  </div>
                  <div className="pg-face pg-face-back">
                    <MiniBall />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <canvas ref={canvasRef} className="pg-canvas" aria-hidden />

      <div className="pg-center">
        <button
          ref={ballRef}
          type="button"
          className="pg-ball"
          aria-label="Ouvrir la Poké Ball et entrer sur PokéFolio"
          aria-disabled={!armed}
          onClick={open}
        >
          <span className="pg-aura" />
          <span className="pg-sonar" />
          <span className="pg-shock" />
          <span className="pg-shock" />
          <span className="pg-shadow" />
          <span className="pg-float">
            <span className="pg-tilt">
              <span className="pg-shake">
                <span className="pg-body">
                  <span className="pg-half pg-base">
                    <BallHalf side="base" />
                  </span>
                  {/* La lumière jaillit entre les deux moitiés : sous le couvercle, devant la base. */}
                  <span className="pg-light" />
                  <span className="pg-half pg-lid">
                    <BallHalf side="lid" />
                  </span>
                  <span className="pg-spec" />
                  <span className="pg-sheen" />
                  <span className="pg-btn-blink" />
                  <span className="pg-btn-idle" />
                  <span className="pg-spark" />
                </span>
              </span>
            </span>
          </span>
          {STARS.map((s, i) => (
            <span
              key={i}
              className="pg-star"
              style={{ "--sx": s.sx, "--sy": s.sy, "--rot": `${s.rot}deg`, "--s": s.s } as CSSProperties}
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c.9 7.4 4.1 10.8 12 12-7.9 1.2-11.1 4.6-12 12-.9-7.4-4.1-10.8-12-12C7.9 10.8 11.1 7.4 12 0Z" />
              </svg>
            </span>
          ))}
        </button>

        <p className="pg-title">
          <span className="sr-only">PokéFolio</span>
          <span className="pg-word" aria-hidden>
            {TITLE.map((letter, i) => (
              <span key={i} className={cn("pg-l", i >= 4 && "pg-l-accent")} style={{ "--i": i } as CSSProperties}>
                {letter}
              </span>
            ))}
          </span>
        </p>
        <p className="pg-tagline">La cote de votre collection Pokémon, chaque jour.</p>
        <p className="pg-hint">
          Ouvrez la Poké Ball pour entrer <kbd>Entrée</kbd>
        </p>
      </div>

      <button type="button" className="pg-skip" onClick={skip}>
        Passer l&apos;intro <kbd>Échap</kbd>
      </button>

      <div className="pg-flood" aria-hidden />
    </div>
  );
}

/** Dégradés partagés par les deux moitiés de la Ball (coordonnées d'une Ball de 200 × 200). */
function BallGradients() {
  return (
    <svg className="pg-defs" aria-hidden width="0" height="0">
      <defs>
        <radialGradient id="pg-red" gradientUnits="userSpaceOnUse" cx="70" cy="56" r="150" fx="62" fy="44">
          <stop offset="0" stopColor="#ff8f74" />
          <stop offset="0.3" stopColor="#ee3b2b" />
          <stop offset="0.72" stopColor="#b7211a" />
          <stop offset="1" stopColor="#6c0f0b" />
        </radialGradient>
        <radialGradient id="pg-white" gradientUnits="userSpaceOnUse" cx="70" cy="56" r="168">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#e9ecf3" />
          <stop offset="0.82" stopColor="#b3b9c9" />
          <stop offset="1" stopColor="#737a8d" />
        </radialGradient>
        <radialGradient id="pg-button" gradientUnits="userSpaceOnUse" cx="94" cy="93" r="24">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.65" stopColor="#e6e9f1" />
          <stop offset="1" stopColor="#a4abbc" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/**
 * Une moitié de la Ball : le viewBox ne montre que le haut (lid) ou le bas (base) d'un même dessin,
 * ce qui coupe proprement la Ball à l'équateur pour l'ouvrir.
 */
function BallHalf({ side }: { side: "lid" | "base" }) {
  const lid = side === "lid";
  // 101 unités de haut : chaque moitié déborde d'une unité sur l'autre (voir .pg-half).
  const viewBox = lid ? "0 0 200 101" : "0 99 200 101";
  const bandY = lid ? 93 : 107;
  return (
    <>
      <svg className="pg-fill" viewBox={viewBox} aria-hidden>
        <circle cx="100" cy="100" r="94" fill={lid ? "url(#pg-red)" : "url(#pg-white)"} />
        <rect x="6" y="93" width="188" height="14" fill="#15161d" />
        <circle cx="100" cy="100" r="27" fill="#15161d" />
        <circle cx="100" cy="100" r="17" fill="url(#pg-button)" />
        <circle cx="100" cy="100" r="11.5" fill="none" stroke="#c3c8d4" strokeWidth="1.5" />
      </svg>
      <svg className="pg-ink" viewBox={viewBox} aria-hidden>
        <circle cx="100" cy="100" r="94" pathLength={1} strokeWidth="5" transform="rotate(-90 100 100)" />
        {/* La bande part de l'anneau central (r = 27, coupé à ±26 px de l'axe) vers les bords. */}
        <path d={`M74 ${bandY}H6`} pathLength={1} strokeWidth="3" style={{ "--d": "180ms" } as CSSProperties} />
        <path d={`M126 ${bandY}H194`} pathLength={1} strokeWidth="3" style={{ "--d": "180ms" } as CSSProperties} />
        <circle
          cx="100"
          cy="100"
          r="27"
          pathLength={1}
          strokeWidth="3"
          transform="rotate(90 100 100)"
          style={{ "--d": "300ms" } as CSSProperties}
        />
        <circle
          cx="100"
          cy="100"
          r="17"
          pathLength={1}
          strokeWidth="2.5"
          transform="rotate(-90 100 100)"
          style={{ "--d": "420ms" } as CSSProperties}
        />
      </svg>
    </>
  );
}

/** Dos de carte stylisé. */
function MiniBall() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden>
      <path d="M5 50a45 45 0 0 1 90 0Z" fill="#e8352a" />
      <path d="M5 50a45 45 0 0 0 90 0Z" fill="#eef0f6" />
      <path d="M5 50h90" stroke="#15161d" strokeWidth="7" />
      <circle cx="50" cy="50" r="13" fill="#eef0f6" stroke="#15161d" strokeWidth="7" />
    </svg>
  );
}

/** Lien discret pour rejouer l'intro. */
export function ReplayGateButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={replayGate} className={className}>
      Revoir l&apos;intro
    </button>
  );
}
