// Moteur de particules (canvas 2D) de la gate d'entrée : poussière holographique ambiante,
// énergie de capture aspirée en spirale par la Poké Ball, étincelles du « clic » et explosion à l'ouverture.

type Rgb = readonly [number, number, number];

const DUST: readonly Rgb[] = [
  [255, 222, 120],
  [255, 255, 255],
  [150, 185, 255],
];
const ENERGY: readonly Rgb[] = [
  [255, 84, 64],
  [255, 168, 150],
  [255, 255, 255],
];
const SPARK: readonly Rgb[] = [
  [255, 214, 90],
  [255, 255, 255],
  [255, 156, 64],
];

type Dust = { x: number; y: number; vx: number; vy: number; rise: number; size: number; phase: number; twinkle: number; color: Rgb };
/** Particule d'énergie en coordonnées polaires autour du centre de la Ball. */
type Energy = { a: number; r: number; va: number; size: number; color: Rgb; px: number; py: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: Rgb; drag: number; gravity: number };

export type ParticleEngine = {
  /** Centre et rayon de la Poké Ball, en pixels CSS du viewport. */
  setFocus(x: number, y: number, radius: number): void;
  setPointer(x: number | null, y: number | null): void;
  converge(duration: number): void;
  burst(): void;
  explode(): void;
  destroy(): void;
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
const rgba = ([r, g, b]: Rgb, a: number) => `rgba(${r},${g},${b},${a})`;

export function createParticleEngine(canvas: HTMLCanvasElement): ParticleEngine {
  const ctx = canvas.getContext("2d")!;
  let w = 0;
  let h = 0;
  const dust: Dust[] = [];
  const energy: Energy[] = [];
  const sparks: Spark[] = [];
  const focus = { x: 0, y: 0, r: 100 };
  let pointer: { x: number; y: number } | null = null;
  let convergeUntil = 0;
  let glow = 0;
  let time = 0;
  let last = performance.now();
  let raf = 0;

  const makeDust = (anywhere: boolean): Dust => ({
    x: rand(0, w),
    y: anywhere ? rand(0, h) : h + 10,
    vx: 0,
    vy: 0,
    rise: rand(-0.28, -0.06),
    size: rand(0.5, 1.7),
    phase: rand(0, Math.PI * 2),
    twinkle: rand(0.01, 0.04),
    color: pick(DUST),
  });

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const target = Math.min(170, Math.round((w * h) / 8500));
    while (dust.length < target) dust.push(makeDust(true));
    dust.length = target;
  }

  function spawnEnergy(dt: number) {
    const count = Math.round(6 * dt);
    const reach = Math.hypot(w, h) * 0.55;
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const r = reach * rand(0.75, 1.05);
      energy.push({
        a,
        r,
        va: rand(0.012, 0.022),
        size: rand(0.8, 2.2),
        color: pick(ENERGY),
        px: focus.x + Math.cos(a) * r,
        py: focus.y + Math.sin(a) * r,
      });
    }
  }

  function emitSparks(n: number, speed: [number, number], life: [number, number], size: [number, number], drag: number, gravity: number) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(...speed);
      const start = focus.r * rand(0.2, 0.6);
      sparks.push({
        x: focus.x + Math.cos(a) * start,
        y: focus.y + Math.sin(a) * start,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0,
        max: rand(...life),
        size: rand(...size),
        color: pick(SPARK),
        drag,
        gravity,
      });
    }
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    // dt normalisé sur 60 i/s, borné pour éviter les sauts après un onglet en arrière-plan.
    const dt = Math.min((now - last) / 16.667, 3);
    last = now;
    time += dt;

    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    // Halo au cœur de la Ball, nourri par l'énergie absorbée.
    if (glow > 0.01) {
      const g = ctx.createRadialGradient(focus.x, focus.y, 0, focus.x, focus.y, focus.r * 2.2);
      g.addColorStop(0, `rgba(255,236,190,${0.55 * glow})`);
      g.addColorStop(0.35, `rgba(255,110,80,${0.22 * glow})`);
      g.addColorStop(1, "rgba(255,110,80,0)");
      ctx.fillStyle = g;
      ctx.fillRect(focus.x - focus.r * 2.2, focus.y - focus.r * 2.2, focus.r * 4.4, focus.r * 4.4);
      glow *= Math.pow(0.965, dt);
    }

    for (const d of dust) {
      if (pointer) {
        const dx = d.x - pointer.x;
        const dy = d.y - pointer.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 140 && dist > 0.1) {
          const push = (1 - dist / 140) * 0.35 * dt;
          d.vx += (dx / dist) * push;
          d.vy += (dy / dist) * push * 0.6;
        }
      }
      const damp = Math.pow(0.95, dt);
      d.vx *= damp;
      d.vy *= damp;
      d.x += (d.vx + Math.sin(time * 0.02 + d.phase) * 0.18) * dt;
      d.y += (d.rise + d.vy) * dt;
      if (d.y < -12 || d.x < -40 || d.x > w + 40 || d.y > h + 40) Object.assign(d, makeDust(false));
      const alpha = 0.25 + 0.6 * Math.abs(Math.sin(time * d.twinkle + d.phase));
      ctx.fillStyle = rgba(d.color, alpha * 0.14);
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size * 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(d.color, alpha);
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      ctx.fill();
    }

    if (now < convergeUntil) spawnEnergy(dt);
    for (let i = energy.length - 1; i >= 0; i--) {
      const e = energy[i];
      e.r -= (e.r * 0.05 + 1.4) * dt;
      e.a += e.va * dt * (1 + 140 / Math.max(e.r, 24));
      const x = focus.x + Math.cos(e.a) * e.r;
      const y = focus.y + Math.sin(e.a) * e.r;
      if (e.r < focus.r * 0.18) {
        energy.splice(i, 1);
        glow = Math.min(1, glow + 0.025);
        continue;
      }
      ctx.strokeStyle = rgba(e.color, Math.min(1, 0.35 + 60 / e.r));
      ctx.lineWidth = e.size;
      ctx.beginPath();
      ctx.moveTo(e.px, e.py);
      ctx.lineTo(x, y);
      ctx.stroke();
      e.px = x;
      e.py = y;
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life += dt;
      if (s.life >= s.max) {
        sparks.splice(i, 1);
        continue;
      }
      const drag = Math.pow(s.drag, dt);
      s.vx *= drag;
      s.vy = s.vy * drag + s.gravity * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const k = 1 - s.life / s.max;
      // Traînée proportionnelle à la vitesse : flou de mouvement bon marché.
      ctx.strokeStyle = rgba(s.color, k);
      ctx.lineWidth = s.size * (0.4 + k * 0.6);
      ctx.beginPath();
      ctx.moveTo(s.x - s.vx * 2.2, s.y - s.vy * 2.2);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
    }
  }

  resize();
  window.addEventListener("resize", resize);
  raf = requestAnimationFrame(frame);

  return {
    setFocus(x, y, radius) {
      focus.x = x;
      focus.y = y;
      focus.r = radius;
    },
    setPointer(x, y) {
      pointer = x == null || y == null ? null : { x, y };
    },
    converge(duration) {
      convergeUntil = performance.now() + duration;
    },
    burst() {
      glow = 1;
      emitSparks(46, [3, 9], [36, 70], [1.2, 2.6], 0.93, 0.12);
    },
    explode() {
      glow = 1;
      emitSparks(240, [6, 24], [45, 90], [1.4, 3.6], 0.955, 0.02);
      // La poussière est soufflée vers l'extérieur : effet de saut en vitesse lumière.
      for (const d of dust) {
        const dx = d.x - focus.x;
        const dy = d.y - focus.y;
        const dist = Math.max(Math.hypot(dx, dy), 1);
        d.vx += (dx / dist) * rand(8, 18);
        d.vy += (dy / dist) * rand(8, 18);
      }
    },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    },
  };
}
