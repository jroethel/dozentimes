// The frame compositor: which scene or transition is on screen, the dial HUD, the outro, grain.
import { Canvas } from "skia-canvas";
import {
  type Ctx, view, clamp, lerp, ph, ease, hash, rgba, mix, TAU, blurPx, serif, sans, mono,
  riseLine, text, glow, dot, line, rrect, ground, grain, vignette,
} from "./kit.ts";
import {
  PAINTERS, hook, hourPos, EVT, STAMP, stampMark, ACCESS_SPOT, NOTE_POS, SEQ_Y, INT, RING, asof,
} from "./scenes.ts";
import { PAL, KINDS, TRANS, CUE, SHORT, type Pal, sweepU, hourHit } from "./timeline.ts";

let W = 1920, H = 1080, S = 1;
let layers: Canvas[] = [];

export function setup(w: number, h: number) {
  W = w; H = h; S = w / 1920; view.S = S;
  layers = [new Canvas(w, h), new Canvas(w, h)];
}

function layer(i: number, paint: (c: Ctx) => void) {
  const c = layers[i];
  const g = c.getContext("2d");
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  g.setTransform(S, 0, 0, S, 0, 0);
  paint(g);
  return c;
}
const full = (ctx: Ctx, c: Canvas) => ctx.drawImage(c, 0, 0, 1920, 1080);

// ---------- scenes ----------

// 0 = hook, 1..12 = the kinds, 13 = outro
export function paintScene(i: number, ctx: Ctx, t: number) {
  if (i === 0) return hook(ctx, t);
  if (i === 13) return outro(ctx, t);
  const kd = KINDS[i - 1];
  PAINTERS[i - 1](ctx, t - kd.start, t);
}

// the scene whose palette owns the frame: switches at each transition's midpoint
export function sceneAt(t: number) {
  let n = 0;
  for (const tr of TRANS) if (t >= (tr.a + tr.b) / 2) n = tr.to;
  return n;
}
const palOf = (i: number): Pal => (i === 0 ? PAL.hook : i === 13 ? PAL.outro : PAL[KINDS[i - 1].key]);

// ---------- transitions ----------

const TR: Record<string, (ctx: Ctx, t: number, tr: (typeof TRANS)[number]) => void> = {
  // the camera falls into hour 1 of the clock, which becomes the event dot
  "dial dive": (ctx, t) => {
    const b = ph(t, 5.7, 6.0, ease.io2);
    if (b <= 0) return hook(ctx, t);
    if (b >= 1) return paintScene(1, ctx, t);
    full(ctx, layer(0, (c) => hook(c, t)));
    ctx.globalAlpha = b;
    full(ctx, layer(1, (c) => paintScene(1, c, t)));
    ctx.globalAlpha = 1;
  },

  // the touchdown ripple grows until the next kind is inside it
  "ripple iris": (ctx, t) => {
    const u = ph(t, 9.3, 10.2, ease.io3);
    const r = 1260 * u;
    paintScene(1, ctx, t);
    ctx.save();
    ctx.beginPath(); ctx.arc(EVT.x, EVT.y, r, 0, TAU); ctx.clip();
    paintScene(2, ctx, t);
    ctx.restore();
    ctx.strokeStyle = rgba(PAL.event.acc, 0.9 * (1 - u)); ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(EVT.x, EVT.y, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = rgba(PAL.valid.acc, 0.5 * (1 - u)); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(EVT.x, EVT.y, Math.max(0, r - 26), 0, TAU); ctx.stroke();
  },

  // the page is cut along the timeline and opens on two lanes
  "line split": (ctx, t) => {
    const A = layer(0, (c) => paintScene(2, c, t));
    paintScene(3, ctx, t);
    const e = ph(t, 13.42, 14.25, ease.io3);
    const y = EVT.y, up = 760 * e, down = 460 * e;
    ctx.drawImage(A, 0, 0, W, y * S, 0, -up, 1920, y);
    ctx.drawImage(A, 0, y * S, W, H - y * S, 0, y + down, 1920, 1080 - y);
    // each half casts a shadow into the gap, and its cut edge catches the light
    for (const [yy, dir] of [[y - up, 1], [y + down, -1]] as const) {
      const g = ctx.createLinearGradient(0, yy, 0, yy + dir * 70);
      g.addColorStop(0, "rgba(0,0,0,0.55)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, Math.min(yy, yy + dir * 70), 1920, 70);
      line(ctx, 0, yy, 1920, yy, "#ffffff", 2, 0.8);
    }
  },

  // the starlight arrives and becomes a camera flash
  "starlight flash": (ctx, t) => {
    if (t < CUE.flash) {
      paintScene(3, ctx, t);
      ctx.fillStyle = rgba("#ffffff", ph(t, 17.62, CUE.flash, ease.in3));
    } else {
      paintScene(4, ctx, t);
      ctx.fillStyle = rgba("#fff6ea", 1 - ph(t, CUE.flash, 18.4, ease.out2));
    }
    ctx.fillRect(0, 0, 1920, 1080);
  },

  // the photo turns over; the cut happens edge-on
  "card flip": (ctx, t) => paintScene(t < CUE.flip ? 4 : 5, ctx, t),

  // the handwriting breaks into drops that fall onto the next line
  "ink rain": (ctx, t) => {
    paintScene(5, ctx, t);
    const cy = 1120 * ph(t, 25.4, 26.3, ease.io3);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, 1920, cy); ctx.clip();
    paintScene(6, ctx, t);
    ctx.restore();
    line(ctx, 0, cy, 1920, cy, PAL.seq.acc, 2, 0.5);
    for (let i = 0; i < 120; i++) {
      const fromNote = i % 3 === 0;
      const ts = 25.3 + hash(i * 1.7) * 0.42;
      if (t < ts) continue;
      const x0 = fromNote ? NOTE_POS.x - 150 + hash(i * 3.1) * 320 : 822 + hash(i * 3.1) * 966;
      const y0 = fromNote ? NOTE_POS.y - 40 + hash(i * 5.3) * 120 : 560 + hash(i * 5.3) * 100;
      const dt = t - ts;
      let y = y0 + 0.5 * 2600 * dt * dt;
      const x = x0 + (hash(i * 7.7) - 0.5) * 60 * dt;
      let a = 1, r = 3 + hash(i) * 3.5;
      if (y >= SEQ_Y) {
        const land = Math.sqrt((2 * (SEQ_Y - y0)) / 2600);
        const since = dt - land;
        y = SEQ_Y; a = 1 - clamp(since / 0.25); r *= 1 + since * 4;
        if (a <= 0) continue;
      }
      const col = y < cy ? PAL.seq.acc : fromNote ? "#ffffff" : PAL.ref.acc;
      dot(ctx, x, y, r, col, a);
    }
  },

  // the stamp falls through the frame and lands on the next kind
  "stamp slam": (ctx, t) => {
    if (t < CUE.stamp) {
      paintScene(6, ctx, t);
      const u = ph(t, 29.55, CUE.stamp, ease.in3);
      ctx.fillStyle = rgba("#000000", 0.4 * u);
      ctx.fillRect(0, 0, 1920, 1080);
      const sc = lerp(3.6, 1, u);
      ctx.save();
      ctx.filter = blurPx(30 * sc);
      ctx.fillStyle = rgba("#000000", 0.5 * u);
      ctx.beginPath(); ctx.arc(STAMP.x + 30 * sc, STAMP.y + 40 * sc, STAMP.r * sc * 1.1, 0, TAU); ctx.fill();
      ctx.restore();
      stampMark(ctx, STAMP.x, STAMP.y, sc, PAL.verify.acc, ph(t, 29.55, 29.72));
    } else {
      const s = t - CUE.stamp;
      const amp = 18 * Math.exp(-s * 13);
      ctx.fillStyle = PAL.verify.bg;
      ctx.fillRect(0, 0, 1920, 1080);
      ctx.save();
      ctx.translate(Math.sin(s * 95) * amp, Math.cos(s * 71) * amp * 0.7);
      paintScene(7, ctx, t);
      ctx.restore();
      const u = ph(s, 0, 0.32, ease.outExpo);
      ctx.strokeStyle = rgba(PAL.verify.acc, 0.6 * (1 - u)); ctx.lineWidth = 5 * (1 - u) + 1;
      ctx.beginPath(); ctx.arc(STAMP.x, STAMP.y, STAMP.r + 420 * u, 0, TAU); ctx.stroke();
      for (let i = 0; i < 14; i++) {
        const ang = (i / 14) * TAU + hash(i) * 0.3, d = STAMP.r + 30 + u * (80 + hash(i * 3) * 120);
        dot(ctx, STAMP.x + Math.cos(ang) * d, STAMP.y + Math.sin(ang) * d, 3 * (1 - u), PAL.verify.ink, 0.5 * (1 - u));
      }
    }
  },

  // the faded stamp's ink spreads until the page is warm and dark
  "ink bleed": (ctx, t) => {
    paintScene(7, ctx, t);
    const R = 2300 * ph(t, 33.4, 34.25, ease.in2);
    const blob = () => {
      ctx.beginPath();
      for (let i = 0; i <= 140; i++) {
        const a = (i / 140) * TAU;
        const r = R * (1 + 0.08 * Math.sin(5 * a + t * 3) + 0.05 * Math.sin(11 * a - t * 2) + 0.03 * Math.sin(23 * a + 1.3));
        const x = STAMP.x + Math.cos(a) * r, y = STAMP.y + Math.sin(a) * r;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
    };
    if (R <= 0) return;
    ctx.save(); blob(); ctx.clip(); paintScene(8, ctx, t); ctx.restore();
    ctx.save();
    ctx.filter = blurPx(22);
    ctx.strokeStyle = rgba(PAL.verify.acc, 0.85); ctx.lineWidth = 70;
    blob(); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = rgba("#a3150c", 0.9); ctx.lineWidth = 8;
    blob(); ctx.stroke();
  },

  // the reading light narrows to the most-read file, goes dark, and opens on lime
  "spotlight iris": (ctx, t) => {
    const close = ph(t, 37.4, CUE.spot.close, ease.in3);
    const ax = lerp(ACCESS_SPOT.x, 960, ease.io3(close)), ay = lerp(ACCESS_SPOT.y, 540, ease.io3(close));
    if (t < CUE.spot.close) {
      paintScene(8, ctx, t);
      const r = lerp(1550, 0, close);
      ctx.fillStyle = "#050302";
      ctx.beginPath(); ctx.rect(0, 0, 1920, 1080); ctx.arc(ax, ay, r, 0, TAU, true); ctx.fill("evenodd");
      ctx.strokeStyle = rgba(PAL.access.acc, 0.7 * close); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(ax, ay, r, 0, TAU); ctx.stroke();
      return;
    }
    ctx.fillStyle = "#050302";
    ctx.fillRect(0, 0, 1920, 1080);
    if (t < CUE.spot.open) {
      const s = t - CUE.spot.close;
      glow(ctx, () => dot(ctx, 960, 540, 6 + 4 * Math.sin(s * 30), PAL.vol.bg2), 14);
      return;
    }
    const o = ph(t, CUE.spot.open, 38.3, ease.outExpo);
    ctx.save();
    ctx.beginPath(); ctx.arc(960, 540, 1200 * o + 6, 0, TAU); ctx.clip();
    paintScene(9, ctx, t);
    ctx.restore();
  },

  // the liquid drains and takes the lime with it
  drain: (ctx, t) => {
    paintScene(9, ctx, t);
    const base = -40 + 1180 * ph(t, 41.45, 42.3, ease.in2);
    const yb = (x: number) => base + Math.sin(x / 110 + t * 9) * 16 + Math.sin(x / 37 - t * 5) * 5;
    const edge = () => {
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(1920, -10);
      for (let x = 1920; x >= 0; x -= 12) ctx.lineTo(x, yb(x));
      ctx.closePath();
    };
    ctx.save(); edge(); ctx.clip(); paintScene(10, ctx, t); ctx.restore();
    ctx.strokeStyle = PAL.vol.bg2; ctx.lineWidth = 6;
    ctx.beginPath();
    for (let x = 0; x <= 1920; x += 12) { if (x) ctx.lineTo(x, yb(x)); else ctx.moveTo(x, yb(x)); }
    ctx.stroke();
  },

  // the future line keeps going and curls into a year
  curl: (ctx, t) => {
    full(ctx, layer(0, (c) => paintScene(10, c, t)));
    ctx.globalAlpha = ph(t, 45.55, 46.2, ease.io2);
    full(ctx, layer(1, (c) => paintScene(11, c, t)));
    ctx.globalAlpha = 1;
    const m = ph(t, 45.35, 46.3, ease.io3);
    const pts: [number, number][] = [];
    for (let i = 0; i <= 240; i++) {
      const s = i / 240;
      const lx = 132 + 1656 * s, ly = INT.y;
      const th = -TAU / 4 + TAU * s;
      const cx = RING.x + Math.cos(th) * RING.r, cy = RING.y + Math.sin(th) * RING.r;
      const e = ease.io3(clamp((m - (1 - s) * 0.4) / 0.6));
      pts.push([lerp(lx, cx, e), lerp(ly, cy, e)]);
    }
    const ink = mix(PAL.intend.ink, PAL.bus.ink, m);
    const stroke = (from: number, to: number, a: number, dash: number[], w: number) => {
      ctx.strokeStyle = rgba(ink, a); ctx.lineWidth = w; ctx.setLineDash(dash); ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = from; i <= to; i++) { if (i === from) ctx.moveTo(...pts[i]); else ctx.lineTo(...pts[i]); }
      ctx.stroke(); ctx.setLineDash([]);
    };
    const nowI = Math.round(((INT.now - 132) / 1656) * 240);
    stroke(0, nowI, lerp(0.75, 0.5, m), [], 3);
    stroke(nowI, 240, lerp(0.45, 0, m), [6, 12], 3);
    stroke(nowI, 240, 0.5 * m, [], 3);
  },

  // the year spins away and lands on the as-of line
  "whip spin": (ctx, t) => {
    const mid = CUE.whip;
    const before = t < mid;
    const u = before ? ph(t, 49.45, mid, ease.in3) : ph(t, mid, 50.3, ease.out3);
    const A = layer(0, (c) => paintScene(before ? 11 : 12, c, t));
    ctx.fillStyle = before ? PAL.bus.bg : PAL.asof.bg;
    ctx.fillRect(0, 0, 1920, 1080);
    ctx.save();
    ctx.translate(960, 540);
    const th = before ? u * 3.4 : -(1 - u) * 3.4;
    ctx.rotate(th);
    // never show a corner: scale until the turned frame still covers the screen
    const cover = Math.abs(Math.cos(th)) + (1920 / 1080) * Math.abs(Math.sin(th));
    const sc = Math.max(before ? 1 + 0.4 * u : 1.4 - 0.4 * u, cover);
    ctx.scale(sc, sc);
    ctx.translate(-960, -540);
    // sub-frames alone leave thin strokes stepped at this speed; a blur that follows the speed fills the gaps
    ctx.filter = blurPx(7 * clamp(1 - Math.abs(t - mid) / 0.35));
    full(ctx, A);
    ctx.filter = "none";
    ctx.restore();
    const f = 1 - clamp(Math.abs(t - mid) / 0.14);
    if (f > 0) { ctx.fillStyle = rgba("#ffffff", 0.3 * f); ctx.fillRect(0, 0, 1920, 1080); }
  },

  // the camera pulls back: the last kind was one hour on a clock of twelve
  "pull back": (ctx, t) => {
    const A = layer(0, (c) => asof(c, Math.min(t - 50, 3.3), Math.min(t, 53.3)));
    outro(ctx, t, A);
  },
};

// ---------- outro ----------

const TILE = { w: 192, h: 108 };
let thumbs: Canvas[] | null = null;
function thumbnails() {
  if (thumbs) return thumbs;
  const s0 = view.S;
  thumbs = KINDS.map((kd, i) => {
    const c = new Canvas(Math.round(TILE.w * S), Math.round(TILE.h * S));
    const g = c.getContext("2d");
    view.S = S * 0.1;
    g.setTransform(S * 0.1, 0, 0, S * 0.1, 0, 0);
    const lt = i === 11 ? 3.3 : 3.0;
    PAINTERS[i](g, lt, i === 11 ? 53.3 : kd.start + lt);
    return c;
  });
  view.S = s0;
  return thumbs;
}

function tileRect(h: number) {
  const P = hourPos(h);
  return { x: P.x - TILE.w / 2, y: P.y - TILE.h / 2, w: TILE.w, h: TILE.h };
}

export function outro(ctx: Ctx, t: number, live?: Canvas) {
  const p = PAL.outro, C = CUE.outro;
  ground(ctx, p.bg, p.bg2, p.acc, t, 0.05);
  const th = thumbnails();
  const u = sweepU(t);
  // the dial
  const da = ph(t, 54.2, 54.9);
  ctx.strokeStyle = rgba(p.ink, 0.14 * da); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(960, 540, 330, 0, TAU); ctx.stroke();
  for (let h = 1; h <= 12; h++) {
    const hit = hourHit(h);
    const m = ph(t, hit - 0.04, hit + 0.16, ease.in3);
    const kd = KINDS[h - 1];
    const col = PAL[kd.key].acc === PAL.vol.acc ? PAL.vol.bg2 : PAL[kd.key].acc;
    // tile
    if (m < 1 && !(h === 12 && t < 55.0)) {
      const a = h === 12 ? 1 : ph(t, 53.95 + h * 0.045, 54.3 + h * 0.045, ease.out3);
      const r = tileRect(h);
      const sc = (1 - m) * lerp(0.85, 1, a);
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
      rrect(ctx, r.x, r.y, r.w, r.h, 8); ctx.clip();
      ctx.drawImage(th[h - 1], r.x, r.y, r.w, r.h);
      ctx.restore();
    }
    // marker and name
    if (m > 0) {
      const P = hourPos(h, 330);
      const pop = ease.outBack(clamp(m));
      glow(ctx, () => dot(ctx, P.x, P.y, 8 * pop, col), 12, 0.8);
      const N = hourPos(h, 438);
      const c = Math.cos(N.a);
      const align = c > 0.3 ? "left" : c < -0.3 ? "right" : "center";
      const fade = 1 - ph(t, C.fade, C.fade + 0.5);
      text(ctx, SHORT[h - 1], N.x, N.y + 11, sans(32, 600), p.ink, ph(t, hit, hit + 0.3) * fade, align);
    }
  }
  // the live last scene shrinking into its hour
  if (live && t < 55.0) {
    const e = ph(t, 53.5, 54.6, ease.ioExpo);
    const r = tileRect(12);
    const x = lerp(0, r.x, e), y = lerp(0, r.y, e), w = lerp(1920, r.w, e), h = lerp(1080, r.h, e);
    ctx.save();
    rrect(ctx, x, y, w, h, 8 * e); ctx.clip();
    ctx.drawImage(live, x, y, w, h);
    ctx.restore();
  }
  // the hand sweeps once round, lighting each kind
  const ha = ph(t, 54.7, 55.0) * (1 - ph(t, C.sweepEnd, C.sweepEnd + 0.3));
  if (ha > 0) {
    const ang = -TAU / 4 + TAU * u;
    line(ctx, 960, 540, 960 + Math.cos(ang) * 300, 540 + Math.sin(ang) * 300, p.ink, 4, ha);
    glow(ctx, () => dot(ctx, 960 + Math.cos(ang) * 300, 540 + Math.sin(ang) * 300, 7, p.acc, ha), 12, ha);
    dot(ctx, 960, 540, 9, p.ink, ha);
  }
  // the payoff of the hook
  const fade = 1 - ph(t, C.fade, C.fade + 0.6);
  riseLine(ctx, "There.", 960, 452, t, { font: serif(58, true), color: p.sub, align: "center", at: C.sweepEnd + 0.05, alpha: fade });
  riseLine(ctx, "Now I've told you", 960, 548, t, { font: serif(76), color: p.ink, align: "center", at: C.bell - 0.3, alpha: fade });
  riseLine(ctx, [{ s: "a dozen", font: serif(76, true) }, { s: "times.", font: serif(76, true), color: p.acc }], 960, 636, t,
    { font: serif(76), color: p.ink, align: "center", at: C.bell - 0.12, alpha: fade });
  const ma = ph(t, C.mark, C.mark + 0.5);
  if (ma > 0) {
    ctx.font = sans(34, 600);
    ctx.letterSpacing = "3px";
    const w = ctx.measureText("freshtime").width;
    ctx.letterSpacing = "0px";
    dot(ctx, 960 - w / 2 - 20, 738, 7, p.acc, ma);
    text(ctx, "freshtime", 960 - w / 2, 750, sans(34, 600), p.ink, ma, "left", 3);
  }
  const end = ph(t, C.fade + 0.2, 60, ease.io2);
  if (end > 0) { ctx.fillStyle = rgba("#000000", end); ctx.fillRect(0, 0, 1920, 1080); }
}

// ---------- HUD: a small dial that counts the hours ----------

function hud(ctx: Ctx, t: number) {
  if (t < 6 || t > 53.8) return;
  const a = ph(t, 6.0, 6.4) * (1 - ph(t, 53.4, 53.7));
  let hour = 1;
  for (let i = 1; i <= 11; i++) {
    const mid = (TRANS[i].a + TRANS[i].b) / 2;
    hour += clamp(ease.spring(clamp((t - mid + 0.12) / 0.6)), 0, 1.2);
  }
  const n = clamp(sceneAt(t), 1, 12);
  const p = palOf(n);
  const cx = 1756, cy = 146, r = 30;
  ctx.strokeStyle = rgba(p.ink, 0.4 * a); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
  for (let h = 1; h <= 12; h++) {
    const P = { x: cx + Math.cos((h / 12) * TAU - TAU / 4) * (r - 8), y: cy + Math.sin((h / 12) * TAU - TAU / 4) * (r - 8) };
    dot(ctx, P.x, P.y, h <= n ? 2.4 : 1.6, h === n ? p.acc === p.ink ? p.ink : p.acc : p.ink, (h <= n ? 0.9 : 0.35) * a);
  }
  const ang = (hour / 12) * TAU - TAU / 4;
  line(ctx, cx, cy, cx + Math.cos(ang) * (r - 9), cy + Math.sin(ang) * (r - 9), p.ink, 3, a);
  dot(ctx, cx, cy, 3.5, p.ink, a);
  const num = String(n).padStart(2, "0");
  ctx.font = mono(30, 500);
  const w = ctx.measureText(" / 12").width;
  text(ctx, " / 12", cx - r - 18, cy + 10, mono(30, 500), p.ink, 0.5 * a, "right");
  text(ctx, num, cx - r - 18 - w, cy + 10, mono(30, 600), p.ink, a, "right");
}

// ---------- the frame ----------

export function blurSamples(t: number) {
  const tr = TRANS.find((x) => t >= x.a && t < x.b);
  return tr ? tr.blur : 0;
}

// tGrain pins the grain to the frame, so motion-blur sub-frames share one grain pattern
export function paintFrame(ctx: Ctx, t: number, tGrain = t) {
  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  const tr = TRANS.find((x) => t >= x.a && t < x.b);
  if (tr) TR[tr.name](ctx, t, tr);
  else paintScene(sceneAt(t), ctx, t);
  hud(ctx, t);
  const p = palOf(sceneAt(t));
  grain(ctx, tGrain, p.dark ? 0.09 : 0.07);
  vignette(ctx, p.dark ? 0.42 : 0.16);
}
