import { Canvas, type SKRSContext2D } from "skia-canvas";
import { BG, INK, DIM, HAIR, W, H, type Scene, ease, clamp } from "./timeline.ts";

export type Ctx = SKRSContext2D;

// ---------- typography ----------

export const MONO = (sz: number, w = "") => `${w ? w + " " : ""}${sz}px Menlo`;
export const DISP = (sz: number, w = "") => `${w ? w + " " : ""}${sz}px Didot`;

export function textW(ctx: Ctx, s: string) { return ctx.measureText(s).width; }

// letter-spaced text drawn char by char; returns total width
export function trackText(ctx: Ctx, s: string, x: number, y: number, tracking: number,
  align: "left" | "center" = "left"): number {
  const chars = [...s];
  const total = chars.reduce((a, ch) => a + ctx.measureText(ch).width + tracking, 0) - (chars.length ? tracking : 0);
  let cx = align === "center" ? x - total / 2 : x;
  for (const ch of chars) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + tracking;
  }
  return total;
}

export function widthTracked(ctx: Ctx, s: string, tracking: number): number {
  const chars = [...s];
  return chars.reduce((a, ch) => a + ctx.measureText(ch).width + tracking, 0) - (chars.length ? tracking : 0);
}

// typewriter: draws the substring revealed at u in [0,1], returns drawn width
export function typeText(ctx: Ctx, s: string, x: number, y: number, u: number, tracking = 0): number {
  const n = Math.round(s.length * clamp01(u));
  if (n <= 0) return 0;
  const vis = s.slice(0, n);
  return tracking ? trackText(ctx, vis, x, y, tracking) : (ctx.fillText(vis, x, y), widthTracked(ctx, vis, 0));
}
function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

// phase in [0,1] over a local-time window, eased
export function ph(lt: number, from: number, to: number, fn: (t: number) => number = ease.io): number {
  if (to <= from) return lt >= to ? 1 : 0;
  return fn(clamp((lt - from) / (to - from)));
}

// ---------- atmosphere ----------

let grainBank: Canvas[] | null = null;
export function grain(ctx: Ctx, frame: number, alpha = 0.05) {
  if (!grainBank) {
    grainBank = [];
    for (let k = 0; k < 10; k++) {
      const g = new Canvas(480, 270);
      const gc = g.getContext("2d");
      const img = gc.createImageData(480, 270);
      let seed = 1234 + k * 9973;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 128 + (rnd() - 0.5) * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      gc.putImageData(img, 0, 0);
      grainBank.push(g);
    }
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "overlay";
  ctx.drawImage(grainBank[frame % 10], 0, 0, W, H);
  ctx.restore();
}

let vignette: Canvas | null = null;
export function vign(ctx: Ctx, strength = 1) {
  if (!vignette) {
    vignette = new Canvas(W, H);
    const vc = vignette.getContext("2d");
    const g = vc.createRadialGradient(W / 2, H / 2, H * 0.40, W / 2, H / 2, H * 0.98);
    g.addColorStop(0, "rgb(255,255,255)");
    g.addColorStop(1, "rgb(88,92,100)"); // cool corner falloff
    vc.fillStyle = g;
    vc.fillRect(0, 0, W, H);
  }
  ctx.save();
  ctx.globalAlpha = strength;
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(vignette, 0, 0);
  ctx.restore();
}

// ---------- recurring motif ----------

// the reading head: thin vertical hairline + caret, the hero of every scene
export function head(ctx: Ctx, x: number, yTop: number, yBot: number, accent: string, alpha = 1, caret = true) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, yTop); ctx.lineTo(x, yBot); ctx.stroke();
  if (caret) {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(x, yTop + 3); ctx.lineTo(x - 7, yTop - 9); ctx.lineTo(x + 7, yTop - 9);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// kicker top-left + hairline; question top-right; both fade in early
export function header(ctx: Ctx, s: Scene, lt: number, qAlpha = 1) {
  const a = ph(lt, 0.10, 0.55);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = MONO(25);
  ctx.fillStyle = s.accent;
  trackText(ctx, s.kicker, 96, 110, 6);
  ctx.strokeStyle = HAIR;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(96, 134); ctx.lineTo(W - 96, 134); ctx.stroke();
  ctx.restore();
  if (qAlpha > 0 && s.question) {
    ctx.save();
    ctx.globalAlpha = a * qAlpha;
    ctx.font = MONO(25);
    ctx.fillStyle = DIM;
    const qw = widthTracked(ctx, s.question, 3);
    trackText(ctx, s.question, W - 96 - qw, 110, 3);
    ctx.restore();
  }
}

// bottom proof line
export function caption(ctx: Ctx, s: Scene, lt: number) {
  const a = ph(lt, 0.5, 1.0);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = MONO(29);
  ctx.fillStyle = "rgba(237,234,227,0.82)";
  const tw = widthTracked(ctx, s.caption, 2);
  trackText(ctx, s.caption, W / 2 - tw / 2, H - 88, 2);
  ctx.fillStyle = s.accent;
  ctx.fillRect(W / 2 - tw / 2 - 30, H - 88 - 19, 15, 4);
  ctx.restore();
}

// ---------- small primitives ----------

export function dot(ctx: Ctx, x: number, y: number, r: number, fill: string, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = fill;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

export function chipBox(ctx: Ctx, x: number, y: number, w: number, h: number, stroke: string, fill?: string, r = 10) {
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  ctx.stroke();
  ctx.restore();
}

export function glowDot(ctx: Ctx, x: number, y: number, r: number, color: string, a = 1) {
  ctx.save();
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 6);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = 0.45 * a;
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r * 6, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = a;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// horizontal time axis with ticks + labels
export function axis(ctx: Ctx, x1: number, x2: number, y: number, label?: (i: number) => string,
  n = 0, color = "rgba(237,234,227,0.4)") {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
  if (n > 0 && label) {
    for (let i = 0; i <= n; i++) {
      const x = lerpN(x1, x2, i / n);
      ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6); ctx.stroke();
      ctx.font = MONO(20);
      ctx.fillStyle = color;
      const s = label(i);
      const w = ctx.measureText(s).width;
      ctx.fillText(s, x - w / 2, y + 34);
    }
  }
  ctx.restore();
}
const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;

// text with a soft glow of its own color (for hero words)
export function glowText(ctx: Ctx, s: string, x: number, y: number, tracking: number, color: string,
  align: "left" | "center" = "left") {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 26;
  ctx.fillStyle = color;
  trackText(ctx, s, x, y, tracking, align);
  ctx.restore();
}

// small mono tag above a point
export function tag(ctx: Ctx, s: string, x: number, y: number, color: string, align: "left" | "center" = "center", alpha = 1, size = 20) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = MONO(size);
  ctx.fillStyle = color;
  trackText(ctx, s, x, y, 1, align);
  ctx.restore();
}
