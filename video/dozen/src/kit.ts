// Shared drawing kit: fonts, easing, colour, type reveals, glow, grain, vignette.
// All coordinates are in the 1920x1080 design space; render.ts scales the context.
import { Canvas, FontLibrary } from "skia-canvas";
import { fileURLToPath } from "node:url";

export type Ctx = ReturnType<Canvas["getContext"]>;

const FONTS = fileURLToPath(new URL("../fonts/", import.meta.url));
FontLibrary.use("Serif", [FONTS + "InstrumentSerif-Regular.ttf", FONTS + "InstrumentSerif-Italic.ttf"]);
FontLibrary.use("Sans", [FONTS + "Inter.ttf"]);
FontLibrary.use("Mono", [FONTS + "GeistMono.ttf"]);
FontLibrary.use("Hand", [FONTS + "Caveat.ttf"]);

export const serif = (px: number, italic = false) => `${italic ? "italic " : ""}${px}px Serif`;
export const sans = (px: number, w = 500) => `${w} ${px}px Sans`;
export const mono = (px: number, w = 450) => `${w} ${px}px Mono`;
export const hand = (px: number, w = 600) => `${w} ${px}px Hand`;

// device pixels per design unit, set by the renderer; filters are not scaled by the transform
export const view = { S: 1 };
export const blurPx = (r: number) => `blur(${(r * view.S).toFixed(2)}px)`;

// ---------- math ----------

export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
export const inv = (a: number, b: number, x: number) => clamp((x - a) / (b - a));
export const TAU = Math.PI * 2;

export const ease = {
  lin: (u: number) => u,
  in2: (u: number) => u * u,
  out2: (u: number) => 1 - (1 - u) * (1 - u),
  io2: (u: number) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2),
  out3: (u: number) => 1 - Math.pow(1 - u, 3),
  in3: (u: number) => u * u * u,
  io3: (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  outExpo: (u: number) => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u)),
  inExpo: (u: number) => (u <= 0 ? 0 : Math.pow(2, 10 * u - 10)),
  ioExpo: (u: number) =>
    u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? Math.pow(2, 20 * u - 10) / 2 : (2 - Math.pow(2, -20 * u + 10)) / 2,
  outBack: (u: number) => 1 + 2.4 * Math.pow(u - 1, 3) + 1.4 * Math.pow(u - 1, 2),
  // damped spring settling at 1
  spring: (u: number) => (u <= 0 ? 0 : 1 - Math.exp(-6.5 * u) * Math.cos(11 * u)),
};

// eased phase of t across [a, b]
export const ph = (t: number, a: number, b: number, fn: (u: number) => number = ease.io3) => fn(inv(a, b, t));

// deterministic hash noise in [0,1)
export function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// ---------- colour ----------

export function hex(c: string): [number, number, number] {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
export const rgba = (c: string, a = 1) => {
  const [r, g, b] = hex(c);
  return `rgba(${r},${g},${b},${clamp(a)})`;
};
export function mix(a: string, b: string, u: number) {
  const A = hex(a), B = hex(b);
  const h = (i: number) => Math.round(lerp(A[i], B[i], clamp(u))).toString(16).padStart(2, "0");
  return `#${h(0)}${h(1)}${h(2)}`;
}

// ---------- type ----------

export type Align = "left" | "center" | "right";

// width of a string with the context's current font and letter spacing
export const tw = (ctx: Ctx, s: string) => ctx.measureText(s).width;

export interface Span { s: string; font?: string; color?: string }

export interface Word { s: string; font: string; color: string; w: number; x: number }

// Lay out a line of spans word by word; x is each word's left edge relative to the line start.
export function layoutWords(ctx: Ctx, spans: Span[] | string, font: string, color: string, spacing = 0) {
  const list: Span[] = typeof spans === "string" ? [{ s: spans }] : spans;
  const words: Word[] = [];
  ctx.letterSpacing = `${spacing}px`;
  ctx.font = font;
  const gap = tw(ctx, " ");
  let x = 0;
  for (const sp of list) {
    const f = sp.font ?? font;
    ctx.font = f;
    for (const s of sp.s.split(" ").filter(Boolean)) {
      const w = tw(ctx, s);
      words.push({ s, font: f, color: sp.color ?? color, w, x });
      x += w + gap;
    }
  }
  ctx.letterSpacing = "0px";
  return { words, total: Math.max(0, x - gap) };
}

export const startX = (x: number, total: number, align: Align = "left") =>
  align === "center" ? x - total / 2 : align === "right" ? x - total : x;

// A line of words that rise out of a mask, staggered, then leave upward.
// spans let one line mix fonts and colours ("a dozen" in italic, "times." in lime).
export function riseLine(
  ctx: Ctx, spans: Span[] | string, x: number, y: number, t: number,
  o: { font: string; color: string; align?: Align; at: number; out?: number; stagger?: number; dur?: number;
       alpha?: number; spacing?: number; hide?: (i: number) => boolean },
) {
  const { words, total } = layoutWords(ctx, spans, o.font, o.color, o.spacing ?? 0);
  const px = parseFloat(o.font.match(/(\d+(?:\.\d+)?)px/)![1]);
  const x0 = startX(x, total, o.align);
  const st = o.stagger ?? 0.06, dur = o.dur ?? 0.7;
  ctx.letterSpacing = `${o.spacing ?? 0}px`;
  words.forEach((w, i) => {
    if (o.hide?.(i)) return;
    const a = ph(t, o.at + i * st, o.at + i * st + dur, ease.outExpo);
    const b = o.out === undefined ? 0 : ph(t, o.out + i * st * 0.6, o.out + i * st * 0.6 + 0.45, ease.in3);
    if (a > 0 && b < 1) {
      const cx = x0 + w.x;
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - px * 0.3, y - px * 1.05, w.w + px * 0.6, px * 1.4);
      ctx.clip();
      ctx.font = w.font;
      ctx.fillStyle = rgba(w.color, (o.alpha ?? 1) * (1 - b * 0.4));
      ctx.fillText(w.s, cx, y + (1 - a) * px * 1.1 - b * px * 1.15);
      ctx.restore();
    }
  });
  ctx.letterSpacing = "0px";
  return { total, x0, words };
}

// Plain text with opacity, alignment and optional letter spacing.
export function text(ctx: Ctx, s: string, x: number, y: number, font: string, color: string, alpha = 1,
  align: Align = "left", spacing = 0) {
  if (alpha <= 0.001) return;
  ctx.font = font;
  ctx.letterSpacing = `${spacing}px`;
  ctx.textAlign = align;
  ctx.fillStyle = rgba(color, alpha);
  ctx.fillText(s, x, y);
  ctx.textAlign = "left";
  ctx.letterSpacing = "0px";
}

// Typewriter with a caret; returns the drawn width.
export function typed(ctx: Ctx, s: string, x: number, y: number, t: number, at: number, cps: number,
  font: string, color: string, caret = true) {
  ctx.font = font;
  const n = clamp(Math.floor((t - at) * cps), 0, s.length);
  const vis = s.slice(0, n);
  ctx.fillStyle = color;
  ctx.fillText(vis, x, y);
  const w = tw(ctx, vis);
  if (caret && t >= at - 0.3 && (n < s.length || Math.floor(t * 2.5) % 2 === 0)) {
    const px = parseFloat(font.match(/(\d+(?:\.\d+)?)px/)![1]);
    ctx.fillRect(x + w + px * 0.08, y - px * 0.78, Math.max(2, px * 0.06), px * 0.95);
  }
  return w;
}

// ---------- light ----------

// Soft glow: the shape is drawn blurred twice under a sharp pass.
export function glow(ctx: Ctx, draw: () => void, r: number, strength = 1) {
  ctx.save();
  ctx.filter = blurPx(r);
  ctx.globalAlpha = 0.9 * strength;
  draw();
  ctx.filter = blurPx(r * 0.35);
  ctx.globalAlpha = 0.8 * strength;
  draw();
  ctx.restore();
  draw();
}

export function dot(ctx: Ctx, x: number, y: number, r: number, color: string, a = 1) {
  ctx.fillStyle = rgba(color, a);
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, TAU);
  ctx.fill();
}

export function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, color: string, w: number, a = 1,
  dash: number[] = []) {
  ctx.strokeStyle = rgba(color, a);
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// ---------- atmosphere ----------

// Ground: a two-stop radial gradient plus a slow, soft light bloom in the accent hue.
export function ground(ctx: Ctx, bg: string, bg2: string, bloom: string, t: number, bloomA = 0.18,
  cx = 960, cy = 540) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1920, 1080);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 1250);
  g.addColorStop(0, bg2);
  g.addColorStop(1, bg);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1920, 1080);
  if (bloomA > 0) {
    const bx = 1320 + Math.sin(t * 0.35) * 180, by = 330 + Math.cos(t * 0.27) * 90;
    const b = ctx.createRadialGradient(bx, by, 0, bx, by, 760);
    b.addColorStop(0, rgba(bloom, bloomA));
    b.addColorStop(1, rgba(bloom, 0));
    ctx.fillStyle = b;
    ctx.fillRect(0, 0, 1920, 1080);
  }
}

let grainTiles: Canvas[] | null = null;
// Film grain: a bank of noise tiles, swapped at 24 per second, laid over with soft light.
export function grain(ctx: Ctx, t: number, amount = 0.07) {
  if (!grainTiles) {
    grainTiles = [];
    for (let k = 0; k < 8; k++) {
      const c = new Canvas(640, 360);
      const g = c.getContext("2d");
      const img = g.createImageData(640, 360);
      const r = rng(9001 + k * 7919);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 128 + (r() + r() + r() - 1.5) * 120;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      grainTiles.push(c);
    }
  }
  const tile = grainTiles[Math.floor(t * 24) % grainTiles.length];
  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  ctx.globalAlpha = amount;
  for (let y = 0; y < 1080; y += 360) for (let x = 0; x < 1920; x += 640) ctx.drawImage(tile, x, y);
  ctx.restore();
}

export function vignette(ctx: Ctx, a = 0.38) {
  const g = ctx.createRadialGradient(960, 540, 420, 960, 540, 1180);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1920, 1080);
}
