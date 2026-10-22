// Scene painters. Each paints a whole frame (ground first) at local time lt, where lt = 0 is the
// scene's start. Painters are called outside [0, 4] while a transition is blending them in or out,
// and each one animates its own half of the cut-on-action transitions (card flip, stamp, curl).
import {
  type Ctx, type Span, serif, sans, mono, hand, blurPx, clamp, lerp, inv, ph, ease, hash, rgba, mix, TAU,
  riseLine, layoutWords, startX, text, typed, glow, dot, line, rrect, ground,
} from "./kit.ts";
import { PAL, KINDS, CUE, type Pal, type Kind } from "./timeline.ts";

const L = 132, R = 1788; // safe margins

// ---------- shared pieces ----------

function header(ctx: Ctx, kd: Kind, lt: number, p: Pal, out?: number) {
  riseLine(ctx, kd.name, L - 4, 236, lt, { font: serif(132), color: p.ink, at: 0.02, out, stagger: 0.08, dur: 0.85 });
  riseLine(ctx, kd.q, L, 308, lt, {
    font: sans(50, 450), color: p.ink, alpha: 0.78, at: 0.2, out: out === undefined ? undefined : out + 0.06, stagger: 0.045,
  });
}

function payoff(ctx: Ctx, s: string | Span[], lt: number, at: number, p: Pal, out?: number, y = 975) {
  riseLine(ctx, s, L, y, lt, { font: serif(76, true), color: p.ink, at, out, stagger: 0.07, dur: 0.8 });
}

function stars(ctx: Ctx, t: number, color: string, n: number, seed: number, amp = 1) {
  for (let i = 0; i < n; i++) {
    const x = hash(seed + i * 3.1) * 1920, y = hash(seed + i * 7.7) * 1080;
    const r = 0.5 + hash(seed + i * 1.3) * 1.6;
    const a = (0.25 + 0.75 * Math.abs(Math.sin(t * (0.6 + hash(i) * 1.8) + i))) * 0.55 * amp;
    dot(ctx, x, y, r, color, a);
  }
}

function rings(ctx: Ctx, x: number, y: number, since: number, color: string, n = 3, maxR = 380, life = 1.3, w = 3) {
  for (let i = 0; i < n; i++) {
    const u = (since - i * 0.13) / life;
    if (u <= 0 || u >= 1) continue;
    ctx.strokeStyle = rgba(color, (1 - u) * 0.8);
    ctx.lineWidth = w * (1 - u) + 0.5;
    ctx.beginPath();
    ctx.arc(x, y, 14 + ease.outExpo(u) * maxR, 0, TAU);
    ctx.stroke();
  }
}

function flashAt(ctx: Ctx, x: number, y: number, since: number, color: string, r = 90, life = 0.5) {
  const u = since / life;
  if (u <= 0 || u >= 1) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * (0.4 + u));
  g.addColorStop(0, rgba("#ffffff", 1 - u));
  g.addColorStop(0.3, rgba(color, (1 - u) * 0.7));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - 400, y - 400, 800, 800);
}

// digits roll like a counter, then lock left to right
function rollText(ctx: Ctx, s: string, x: number, y: number, lt: number, from: number, lockAt: number, step: number,
  font: string, color: string, alpha = 1) {
  ctx.font = font;
  let cx = x;
  [...s].forEach((ch, i) => {
    const w = ctx.measureText(ch).width;
    const locked = lt >= lockAt + i * step;
    let c = ch;
    if (/\d/.test(ch) && !locked) c = String(Math.floor(hash(i * 17 + Math.floor(lt * 30)) * 10));
    const pop = locked ? 1 + 0.12 * (1 - ph(lt, lockAt + i * step, lockAt + i * step + 0.25, ease.out3)) : 1;
    ctx.save();
    ctx.translate(cx + w / 2, y);
    ctx.scale(pop, pop);
    ctx.fillStyle = rgba(color, alpha * (locked ? 1 : 0.55) * ph(lt, from, from + 0.15));
    ctx.textAlign = "center";
    ctx.fillText(c, 0, 0);
    ctx.restore();
    cx += w;
  });
  ctx.textAlign = "left";
}

function arrowHead(ctx: Ctx, x: number, y: number, ang: number, size: number, color: string, a = 1) {
  ctx.fillStyle = rgba(color, a);
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(ang) * size, y + Math.sin(ang) * size);
  ctx.lineTo(x + Math.cos(ang + 2.5) * size, y + Math.sin(ang + 2.5) * size);
  ctx.lineTo(x + Math.cos(ang - 2.5) * size, y + Math.sin(ang - 2.5) * size);
  ctx.closePath();
  ctx.fill();
}

// quadratic arc from a to b bulging by h (negative = up), drawn to fraction u
function arcPath(ctx: Ctx, ax: number, ay: number, bx: number, by: number, h: number, u: number, color: string,
  w: number, a = 1, dash: number[] = []) {
  const cx = (ax + bx) / 2, cy = (ay + by) / 2 + h * 2;
  const n = 48, m = Math.max(1, Math.round(n * clamp(u)));
  ctx.strokeStyle = rgba(color, a);
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.setLineDash(dash);
  ctx.beginPath();
  let px = ax, py = ay;
  for (let i = 0; i <= m; i++) {
    const s = (i / n);
    px = (1 - s) * (1 - s) * ax + 2 * (1 - s) * s * cx + s * s * bx;
    py = (1 - s) * (1 - s) * ay + 2 * (1 - s) * s * cy + s * s * by;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  const s = m / n, e = Math.max(0, s - 0.02);
  const qx = (1 - e) * (1 - e) * ax + 2 * (1 - e) * e * cx + e * e * bx;
  const qy = (1 - e) * (1 - e) * ay + 2 * (1 - e) * e * cy + e * e * by;
  return { x: px, y: py, ang: Math.atan2(py - qy, px - qx) };
}

// ============================================================ HOOK

export const HOOK_RING = { cx: 960, cy: 540, r: 400 };
export const hourPos = (h: number, r = HOOK_RING.r) => {
  const a = (h % 12) * (TAU / 12) - TAU / 4;
  return { x: HOOK_RING.cx + Math.cos(a) * r, y: HOOK_RING.cy + Math.sin(a) * r, a };
};
export const EVENT_DOT = { x: 935, y: 250 };

export function hook(ctx: Ctx, t: number) {
  const p = PAL.hook, C = CUE.hook;
  ground(ctx, p.bg, p.bg2, p.acc, t, 0.05);

  // the dive: the camera falls into hour 1, which becomes the event dot
  const P1 = hourPos(1);
  const zoomU = ph(t, 5.45, 5.95, ease.inExpo);
  const moveU = ph(t, 5.45, 5.95, ease.io3);
  const Z = lerp(1, 9, zoomU);
  const cx = lerp(P1.x, EVENT_DOT.x, moveU), cy = lerp(P1.y, EVENT_DOT.y, moveU);
  const fadeAll = 1 - ph(t, 5.5, 5.85, ease.io2);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(Z, Z);
  ctx.translate(-P1.x, -P1.y);

  // a faint clock face, there from the first frame, brightens when the twelve land; its hour ticks sit under the words
  const face = 0.06 + 0.16 * ph(t, 3.4, 4.3);
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU;
    const r0 = i % 5 === 0 ? 474 : 486;
    line(ctx, 960 + Math.cos(a) * r0, 540 + Math.sin(a) * r0, 960 + Math.cos(a) * 498, 540 + Math.sin(a) * 498, p.ink, i % 5 === 0 ? 2.5 : 1.5, face);
  }

  const big = serif(104), bigI = serif(104, true);
  const line2: Span[] = [{ s: "I've told you" }, { s: "a dozen", font: bigI }, { s: "times.", font: bigI, color: p.acc }];
  riseLine(ctx, "If I've told you once,", 960, 470, t, { font: big, color: p.ink, align: "center", at: C.line1, out: 2.4, stagger: 0.08 });
  const l2 = riseLine(ctx, line2, 960, 610, t, {
    font: big, color: p.ink, align: "center", at: C.line2, out: 2.46, stagger: 0.08, hide: (i) => i === 5 && t >= 2.95,
  });

  // "times." leaves the sentence and becomes the centre of a clock
  const tw5 = l2.words[5];
  const sx = l2.x0 + tw5.x, sy = 610;
  ctx.font = bigI;
  const wT = ctx.measureText("times.").width;
  if (t >= 2.95 && t < 3.8) {
    const u = ph(t, 2.95, 3.28, ease.io3);
    const x = lerp(sx, 960 - wT / 2, u), y = lerp(sy, 572, u);
    const a = 1 - ph(t, 3.2, 3.5, ease.io2);
    text(ctx, "times.", x, y, bigI, p.acc, a);
  }
  // twelve copies fan out to the hours
  for (let h = 1; h <= 12; h++) {
    const i = h - 1, at = C.fan + i * 0.06;
    const u = ph(t, at, at + 0.6, ease.outExpo);
    if (u <= 0) continue;
    const P = hourPos(h);
    const x = lerp(960, P.x, u), y = lerp(560, P.y, u);
    const hi = h === 1 ? ph(t, 5.2, 5.4) : 0;
    let a = (t > 5.2 && h !== 1 ? 1 - 0.55 * ph(t, 5.2, 5.4) : 1) * ph(t, at, at + 0.15);
    if (h === 1) a *= 1 - ph(t, 5.38, 5.5);
    const f = serif(46 + hi * 8, true);
    const ping = 1 - ph(t, at + 0.35, at + 0.9, ease.out2);
    const draw = () => text(ctx, "times", x, y + 15, f, p.acc, a, "center");
    if (ping > 0 || hi > 0) glow(ctx, draw, 14, Math.max(ping, hi) * a); else draw();
  }
  riseLine(ctx, "Literally.", 960, 572, t, { font: serif(96, true), color: p.ink, align: "center", at: C.literally, out: 4.05 });
  riseLine(ctx, "Twelve kinds", 960, 530, t, { font: serif(100), color: p.ink, align: "center", at: C.title, stagger: 0.09 });
  riseLine(ctx, "of time.", 960, 630, t, { font: serif(100), color: p.ink, align: "center", at: C.title + 0.14, stagger: 0.09 });
  ctx.restore();

  // the hour-1 word collapses into a dot that rides the dive
  if (t >= 5.32) {
    const r = 12 * ph(t, 5.32, 5.5, ease.outBack);
    const col = mix(p.acc, PAL.event.acc, ph(t, 5.4, 5.9));
    glow(ctx, () => dot(ctx, cx, cy, r, col), 18, 1);
  }
  if (fadeAll < 1) {
    // let the zoomed text fall away into the ground
    ctx.fillStyle = rgba(p.bg, (1 - fadeAll) * 0.9);
    ctx.fillRect(0, 0, 1920, 1080);
    const r = 12;
    glow(ctx, () => dot(ctx, cx, cy, r, mix(p.acc, PAL.event.acc, ph(t, 5.4, 5.9))), 18, 1);
  }
}

// ============================================================ 01 EVENT

export const EVT = { y: 690, x: 935 };
const yrX = (yr: number, a: number, b: number) => L + ((yr - a) / (b - a)) * (R - L);

export function event(ctx: Ctx, lt: number, t: number) {
  const p = PAL.event, kd = KINDS[0];
  ground(ctx, p.bg, p.bg2, p.acc, t, 0.12, EVT.x, EVT.y);
  stars(ctx, t, p.ink, 90, 11, 0.6);
  const { x: X, y: Y } = EVT;
  // the Moon's limb under the line
  const limb = ph(lt, -0.4, 0.6, ease.out3);
  const mg = ctx.createLinearGradient(0, 760, 0, 1080);
  mg.addColorStop(0, rgba("#8f9bc2", 0.2 * limb));
  mg.addColorStop(0.08, rgba("#3a4670", 0.22 * limb));
  mg.addColorStop(1, rgba("#0b1233", 0.0));
  ctx.fillStyle = mg;
  ctx.beginPath(); ctx.arc(960, 760 + 3400, 3400, 0, TAU); ctx.fill();
  for (let i = 0; i < 9; i++) {
    const cx = 160 + hash(i * 4.1) * 1600, cy = 830 + hash(i * 2.3) * 200, rw = 30 + hash(i) * 90;
    ctx.strokeStyle = rgba("#aab4d8", 0.06 * limb); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(cx, cy, rw, rw * 0.22, 0, 0, TAU); ctx.stroke();
  }

  const a = ph(lt, -0.25, 0.7, ease.outExpo);
  line(ctx, lerp(X, L, a), Y, lerp(X, R, a), Y, p.ink, 2, 0.4);
  for (let yr = 1955; yr <= 1985; yr += 5) {
    const x = yrX(yr, 1955, 1985);
    const ta = ph(lt, 0.2 + Math.abs(x - X) / 3000, 0.6 + Math.abs(x - X) / 3000);
    line(ctx, x, Y - 8, x, Y + 8, p.ink, 2, 0.4 * ta);
    if (yr % 10 === 0) text(ctx, String(yr), x, Y + 50, mono(28), p.sub, ta, "center");
  }

  const touch = CUE.event.touch - kd.start;
  // the fall
  if (lt < touch) {
    const u = ph(lt, 0, touch, ease.in2);
    const y = lerp(EVENT_DOT.y, Y, u);
    if (u > 0) {
      const g = ctx.createLinearGradient(X, y - 160 * u, X, y);
      g.addColorStop(0, rgba(p.acc, 0));
      g.addColorStop(1, rgba(p.acc, 0.7));
      ctx.strokeStyle = g;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(X, y - 160 * u); ctx.lineTo(X, y); ctx.stroke();
    }
    glow(ctx, () => dot(ctx, X, y, 12, p.acc), 18);
  } else {
    const s = lt - touch;
    rings(ctx, X, Y, s, p.acc, 3, 420, 1.4);
    flashAt(ctx, X, Y, s, p.acc, 140, 0.55);
    const pulse = 1 + 0.15 * Math.sin(lt * 5);
    glow(ctx, () => dot(ctx, X, Y, 11 * pulse, p.acc), 20, 1);
    dot(ctx, X, Y, 5, "#ffffff");
    // pin up to the stamp
    const pin = ph(lt, touch + 0.05, touch + 0.4, ease.out3);
    line(ctx, X, Y - 18, X, lerp(Y - 18, 612, pin), p.ink, 2, 0.5);
  }

  // the stamp: name, rolling time, date
  const roll = CUE.event.roll - kd.start, lock = CUE.event.lock - kd.start;
  riseLine(ctx, "Apollo 11", X, 372, lt, { font: sans(42, 600), color: p.acc, align: "center", at: roll - 0.05, spacing: 1 });
  ctx.font = mono(136, 500);
  const wA = ctx.measureText("20:17").width;
  ctx.font = mono(50, 500);
  const wB = ctx.measureText("UTC").width;
  const x0 = X - (wA + 20 + wB) / 2;
  rollText(ctx, "20:17", x0, 500, lt, roll, lock - 0.4, 0.1, mono(136, 500), p.ink);
  text(ctx, "UTC", x0 + wA + 20, 500, mono(50, 500), p.sub, ph(lt, lock - 0.1, lock + 0.2));
  riseLine(ctx, "July 20, 1969", X, 584, lt, { font: serif(78), color: p.ink, align: "center", at: lock - 0.15 });

  header(ctx, kd, lt, p);
}

// ============================================================ 02 VALID

const VX = (yr: number) => yrX(yr, 1900, 2030);

export function valid(ctx: Ctx, lt: number, t: number) {
  const p = PAL.valid, kd = KINDS[1];
  ground(ctx, p.bg, p.bg2, p.acc, t, 0.05, EVT.x, EVT.y);
  const Y = EVT.y;
  line(ctx, L, Y, R, Y, p.ink, 2, 0.28);
  for (let yr = 1900; yr <= 2030; yr += 10) {
    const x = VX(yr);
    line(ctx, x, Y - 7, x, Y + 7, p.ink, 2, 0.28);
    if (yr === 1900 || yr === 1950) text(ctx, String(yr), x, Y + 48, mono(28), p.sub, 0.6 * ph(lt, 0.3, 0.8), "center");
  }
  const x1 = VX(1930), x2 = VX(2006), xNow = VX(2026);

  // the event dot stretches into a lifespan
  const e = ph(lt, -0.3, 0.7, ease.outExpo);
  const l = lerp(EVT.x, x1, e), r = lerp(EVT.x, x2, e);
  const cut = CUE.valid.cut - kd.start;
  // after the cut, a ghost shows where the claim no longer holds
  const ghost = ph(lt, cut + 0.05, cut + 0.5, ease.out3);
  if (ghost > 0) {
    ctx.setLineDash([10, 10]);
    ctx.strokeStyle = rgba(p.acc, 0.45 * ghost);
    ctx.lineWidth = 2;
    rrect(ctx, x2, Y - 13, (xNow - x2) * ghost, 26, 13);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = p.acc;
  rrect(ctx, l - 13, Y - 13, r - l + 26, 26, 13);
  ctx.fill();
  if (lt >= cut) {
    // a clean cut at 2006
    const s = lt - cut;
    ctx.fillStyle = p.bg2;
    ctx.fillRect(x2 + 1, Y - 16, 30, 32);
    line(ctx, x2, Y - 38 * ph(s, 0, 0.12), x2, Y + 38 * ph(s, 0, 0.12), p.ink, 4);
    for (let i = 0; i < 9; i++) {
      const u = ph(s, 0, 0.6, ease.out3);
      const ang = -0.9 + hash(i * 3.3) * 1.8;
      const d = 30 + hash(i * 9.1) * 70;
      ctx.fillStyle = rgba(p.acc, 1 - u);
      ctx.fillRect(x2 + 10 + Math.cos(ang) * d * u, Y + Math.sin(ang) * d * u - 3, 6, 6);
    }
  }

  // label with "planet" struck through after the cut
  const strike = ph(lt, CUE.valid.strike - kd.start, CUE.valid.strike - kd.start + 0.3, ease.io3);
  const lab = riseLine(ctx, [{ s: "Pluto is a" }, { s: "planet", color: mix(p.ink, p.sub, strike) }], (x1 + x2) / 2, 628, lt,
    { font: serif(68), color: p.ink, align: "center", at: 0.4 });
  if (strike > 0) {
    const w = lab.words[3];
    const sx = lab.x0 + w.x - 6;
    line(ctx, sx, 606, sx + (w.w + 12) * strike, 606, p.ink, 5);
  }
  riseLine(ctx, "1930", x1, 752, lt, { font: mono(42, 500), color: p.ink, align: "center", at: 0.7 });
  riseLine(ctx, "2006", x2, 752, lt, { font: mono(42, 500), color: p.ink, align: "center", at: 0.85 });

  payoff(ctx, "Facts expire.", lt, CUE.valid.pay - kd.start, p);
  header(ctx, kd, lt, p);
}

// ============================================================ 03 RECORD

export function recordLanes(lt: number) {
  const e = ph(lt, -0.62, 0.15, ease.outExpo);
  return { top: lerp(EVT.y, 560, e), bot: lerp(EVT.y, 820, e) };
}
const SN = { x: 540 };
const ARR = { x: 1600 };
function cometAt(u: number, top: number, bot: number) {
  const P0 = [SN.x, top], C1 = [980, top], C2 = [1150, bot], P3 = [ARR.x, bot];
  const v = 1 - u;
  const b0 = v * v * v, b1 = 3 * v * v * u, b2 = 3 * v * u * u, b3 = u * u * u;
  return { x: b0 * P0[0] + b1 * C1[0] + b2 * C2[0] + b3 * P3[0], y: b0 * P0[1] + b1 * C1[1] + b2 * C2[1] + b3 * P3[1] };
}

export function record(ctx: Ctx, lt: number, t: number) {
  const p = PAL.record, kd = KINDS[2];
  ground(ctx, p.bg, p.bg2, p.acc, t, 0.07, 1000, 690);
  stars(ctx, t, p.ink, 170, 33, ph(lt, -0.4, 0.4));
  const { top, bot } = recordLanes(lt);
  line(ctx, L, top, R, top, p.ink, 2, 0.4);
  line(ctx, L, bot, R, bot, p.ink, 2, 0.4);
  riseLine(ctx, "Happened", L, top - 26, lt, { font: sans(40, 600), color: p.ink, at: 0.1, alpha: 0.85 });
  riseLine(ctx, "Seen", L, bot - 26, lt, { font: sans(40, 600), color: p.ink, at: 0.2, alpha: 0.85 });

  const burst = CUE.record.burst - kd.start, travel = CUE.record.travel - kd.start, arrive = CUE.record.arrive - kd.start;
  if (lt >= burst) {
    const s = lt - burst;
    flashAt(ctx, SN.x, top, s, p.acc, 440, 1.0);
    const neb = ph(s, 0.1, 0.9, ease.out2);
    const ng = ctx.createRadialGradient(SN.x, top, 0, SN.x, top, 150 + 30 * neb);
    ng.addColorStop(0, rgba("#ffb36b", 0.32 * neb));
    ng.addColorStop(0.5, rgba("#ff6b8a", 0.1 * neb));
    ng.addColorStop(1, rgba("#ff6b8a", 0));
    ctx.fillStyle = ng;
    ctx.fillRect(SN.x - 200, top - 200, 400, 400);
    for (let i = 0; i < 40; i++) {
      const ang = (i / 40) * TAU + hash(i) * 0.2;
      const u = ph(s, 0, 1.0, ease.outExpo);
      const r0 = 18 + u * 40, r1 = 18 + u * (90 + hash(i * 5) * 110);
      ctx.strokeStyle = rgba(p.acc, (1 - ph(s, 0.1, 0.75)) * 0.85);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(SN.x + Math.cos(ang) * r0, top + Math.sin(ang) * r0);
      ctx.lineTo(SN.x + Math.cos(ang) * r1, top + Math.sin(ang) * r1);
      ctx.stroke();
    }
    glow(ctx, () => dot(ctx, SN.x, top, 9 + 3 * Math.sin(lt * 4), p.acc), 22);
    riseLine(ctx, "~166,000 BC", SN.x, top + 56, lt, { font: mono(34, 500), color: p.sub, align: "center", at: burst + 0.2 });
  }
  // the light in transit
  if (lt >= travel) {
    const u = ph(lt, travel, arrive, ease.io2);
    ctx.lineCap = "round";
    for (let i = 0; i < 60; i++) {
      const s0 = Math.max(0, u - 0.3 + (i / 60) * 0.3), s1 = Math.max(0, u - 0.3 + ((i + 1) / 60) * 0.3);
      const A = cometAt(s0, top, bot), B = cometAt(s1, top, bot);
      ctx.strokeStyle = rgba(p.acc, (i / 60) ** 2 * 0.9);
      ctx.lineWidth = 1 + (i / 60) * 4;
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    }
    // the travelled path stays as a faint thread
    ctx.strokeStyle = rgba(p.acc, 0.22);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 9]);
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) { const P = cometAt((i / 80) * u, top, bot); if (i) ctx.lineTo(P.x, P.y); else ctx.moveTo(P.x, P.y); }
    ctx.stroke();
    ctx.setLineDash([]);
    if (u < 1) { const H = cometAt(u, top, bot); glow(ctx, () => dot(ctx, H.x, H.y, 7, "#fff8e6"), 16); }
    riseLine(ctx, "~168,000 years", 780, 772, lt, { font: serif(56, true), color: p.acc, align: "center", at: travel + 0.35 });
  }
  if (lt >= arrive) {
    const s = lt - arrive;
    rings(ctx, ARR.x, bot, s, p.acc, 2, 200, 1.0);
    flashAt(ctx, ARR.x, bot, s, p.acc, 160, 0.6);
    glow(ctx, () => dot(ctx, ARR.x, bot, 9, p.acc), 18);
    riseLine(ctx, "1987", ARR.x, bot + 60, lt, { font: mono(46, 500), color: p.ink, align: "center", at: arrive + 0.05 });
    // into the flash: the arrival blooms
    const bloom = ph(lt, 3.45, 3.9, ease.in3);
    if (bloom > 0) {
      const g = ctx.createRadialGradient(ARR.x, bot, 0, ARR.x, bot, 60 + bloom * 1900);
      g.addColorStop(0, rgba("#ffffff", bloom));
      g.addColorStop(0.5, rgba(p.acc, bloom * 0.8));
      g.addColorStop(1, rgba(p.acc, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1920, 1080);
    }
  }
  header(ctx, kd, lt, p);
}

// ============================================================ 04 SOURCE

const PW = 400, PH = 480, IMG = 352, PS = 1.12;
const STAMP_DATE = "AUG 1 2019";

function photoImage(ctx: Ctx, develop: number) {
  // a sunset over hills, inside the square image area (origin at its top-left)
  const g = ctx.createLinearGradient(0, 0, 0, IMG);
  g.addColorStop(0, "#1f2c6c");
  g.addColorStop(0.55, "#a2629e");
  g.addColorStop(1, "#ffb47c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, IMG, IMG);
  const sun = ctx.createRadialGradient(232, 200, 0, 232, 200, 120);
  sun.addColorStop(0, "rgba(255,236,190,1)");
  sun.addColorStop(0.35, "rgba(255,214,150,0.9)");
  sun.addColorStop(1, "rgba(255,190,120,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, IMG, IMG);
  ctx.fillStyle = "#4a2a5e";
  ctx.beginPath(); ctx.moveTo(0, 250);
  for (let x = 0; x <= IMG; x += 8) ctx.lineTo(x, 250 - Math.sin(x / 60) * 26 - Math.sin(x / 23) * 6);
  ctx.lineTo(IMG, IMG); ctx.lineTo(0, IMG); ctx.fill();
  ctx.fillStyle = "#1c1030";
  ctx.beginPath(); ctx.moveTo(0, 300);
  for (let x = 0; x <= IMG; x += 8) ctx.lineTo(x, 296 - Math.sin(x / 80 + 2) * 30);
  ctx.lineTo(IMG, IMG); ctx.lineTo(0, IMG); ctx.fill();
  if (develop < 1) {
    ctx.fillStyle = rgba("#cfd2c4", 1 - develop);
    ctx.fillRect(0, 0, IMG, IMG);
  }
}

function polaroid(ctx: Ctx, cx: number, cy: number, rot: number, sx: number, develop: number, stampGlow: number,
  back?: (ctx: Ctx) => void) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(sx * PS, PS);
  // shadow
  ctx.save();
  ctx.filter = blurPx(18);
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.fillRect(-PW / 2 + 10, -PH / 2 + 18, PW, PH);
  ctx.restore();
  ctx.fillStyle = back ? "#f7f1e4" : "#fbf7ee";
  ctx.fillRect(-PW / 2, -PH / 2, PW, PH);
  if (back) back(ctx);
  else {
    ctx.save();
    ctx.translate(-IMG / 2, -PH / 2 + 24);
    photoImage(ctx, develop);
    const draw = () => text(ctx, STAMP_DATE, IMG - 16, IMG - 18, mono(28, 600), "#ff8a2a", ph(develop, 0.6, 1), "right", 1);
    glow(ctx, draw, 8, 0.6 + stampGlow);
    ctx.restore();
  }
  ctx.restore();
}

// where the date stamp sits on a polaroid at (cx, cy, rot)
function stampPoint(cx: number, cy: number, rot: number) {
  const lx = (IMG / 2 - 80) * PS, ly = (-PH / 2 + 24 + IMG - 28) * PS;
  return { x: cx + lx * Math.cos(rot) - ly * Math.sin(rot), y: cy + lx * Math.sin(rot) + ly * Math.cos(rot) };
}

export const CARD_MID = { x: 960, y: 560 };

export function source(ctx: Ctx, lt: number, t: number) {
  const p = PAL.source, kd = KINDS[3];
  ground(ctx, p.bg, p.bg2, "#ffd0a0", t, 0.12);
  const copyAt = CUE.source.copy - kd.start, pulseAt = CUE.source.pulse - kd.start;
  const develop = ph(lt, -0.05, 1.0, ease.out2);
  const glowP = Math.sin(Math.PI * ph(lt, pulseAt, pulseAt + 0.7, ease.lin)) * 1.8;

  // exit: the copy leaves, the original turns to centre and starts to flip
  const leave = ph(lt, 3.35, 3.7, ease.in3);
  const toMid = ph(lt, 3.3, 3.65, ease.io3);
  const flipX = 1 - ph(lt, 3.62, 3.85, ease.in2);

  const cu = ph(lt, copyAt, copyAt + 0.65, ease.outExpo);
  const O = { x: lerp(600, CARD_MID.x, toMid), y: lerp(615, CARD_MID.y, toMid), r: lerp(-0.08, 0, toMid) };
  const Cc = { x: lerp(600, 1250, cu) + leave * 900, y: lerp(615, 590, cu), r: lerp(-0.08, 0.07, cu) };
  if (cu > 0) {
    polaroid(ctx, Cc.x, Cc.y, Cc.r, 1, develop, glowP);
    riseLine(ctx, "Downloaded today", 1250, 905, lt, {
      font: sans(42, 600), color: p.ink, align: "center", at: copyAt + 0.3, out: 3.3,
    });
  }
  polaroid(ctx, O.x, O.y, O.r, Math.max(0.002, flipX), develop, glowP);
  if (glowP > 0 && cu > 0.9 && leave === 0) {
    const a = stampPoint(O.x, O.y, O.r), b = stampPoint(Cc.x, Cc.y, Cc.r);
    const u = ph(lt, pulseAt, pulseAt + 0.45, ease.out3);
    arcPath(ctx, a.x, a.y + 14, b.x, b.y + 14, 46, u, p.ink, 3, 0.8 * (1 - ph(lt, 3.0, 3.3)), [2, 10]);
  }
  payoff(ctx, "A copy isn't new.", lt, CUE.source.pay - kd.start, p, 3.3);
  header(ctx, kd, lt, p, 3.3);
}

// ============================================================ 05 REFERENCE

const CELL = { x0: 822, y: 545, w: 112, h: 130, gap: 10 };
const cellX = (i: number) => CELL.x0 + i * (CELL.w + CELL.gap);
const INKPEN = "#1d2a6b";

export function noteBack(ctx: Ctx, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < 6; i++) line(ctx, -PW / 2 + 30, -60 + i * 64, PW / 2 - 30, -60 + i * 64, "#9fb3d9", 1.2, 0.35);
  ctx.save();
  ctx.translate(96, -168);
  ctx.rotate(-0.06);
  text(ctx, "Mar 3", 0, 0, hand(56, 600), INKPEN, 1, "center");
  ctx.restore();
  text(ctx, "See you", -150, -8, hand(84, 600), INKPEN);
  text(ctx, "tomorrow!", -150, 84, hand(84, 600), INKPEN);
  ctx.restore();
}

export const NOTE_POS = { x: 470, y: 610, r: -0.05 };

export function reference(ctx: Ctx, lt: number, t: number) {
  const p = PAL.ref, kd = KINDS[4];
  ground(ctx, p.bg, p.bg2, "#7f93ff", t, 0.16);
  const flipIn = ph(lt, -0.15, 0.22, ease.outBack);
  const move = ph(lt, 0.18, 0.7, ease.ioExpo);
  const N = { x: lerp(CARD_MID.x, NOTE_POS.x, move), y: lerp(CARD_MID.y, NOTE_POS.y, move), r: lerp(0, NOTE_POS.r, move) };
  const rain = 1 - ph(lt, 3.3, 3.6);
  const fall = Math.max(0, lt - 3.35);
  polaroid(ctx, N.x + fall * 120, N.y + 0.5 * 2600 * fall * fall, N.r + fall * 1.4, Math.max(0.002, flipIn), 1, 0,
    (c) => noteBack(c, rain));

  const C = CUE.ref, s = kd.start;
  const cellsA = rain;
  for (let i = 0; i < 8; i++) {
    const a = ph(lt, 0.35 + i * 0.05, 0.75 + i * 0.05, ease.out3) * cellsA;
    if (a <= 0) continue;
    const x = cellX(i), y = CELL.y + (1 - a) * 30;
    let fill = rgba("#ffffff", 0.08 * a), num = p.ink;
    if (i === 1) {
      const f = ph(lt, C.land1 - s, C.land1 - s + 0.2);
      fill = rgba(mix("#ffffff", p.acc, f), lerp(0.08, 1, f) * a);
      num = mix(p.ink, "#1a1a1a", f);
    }
    ctx.fillStyle = fill;
    rrect(ctx, x, y, CELL.w, CELL.h, 14); ctx.fill();
    ctx.strokeStyle = rgba("#ffffff", 0.25 * a); ctx.lineWidth = 1.5; ctx.stroke();
    if (i === 0) text(ctx, "Mar", x + CELL.w / 2, y + 36, mono(24, 500), p.sub, a, "center");
    text(ctx, String(3 + i), x + CELL.w / 2, y + 92, sans(54, 600), num, a, "center");
  }
  const cx = (i: number) => cellX(i) + CELL.w / 2;
  const by = CELL.y + CELL.h + 6;
  // written on Mar 3: tomorrow is Mar 4
  const w0 = ph(lt, C.written - s, C.written - s + 0.3, ease.out3) * cellsA;
  if (w0 > 0) {
    ctx.strokeStyle = rgba(p.acc, w0); ctx.lineWidth = 5;
    rrect(ctx, cellX(0) - 5, CELL.y - 5, CELL.w + 10, CELL.h + 10, 18); ctx.stroke();
    riseLine(ctx, "Written", cx(0), CELL.y - 26, lt, { font: sans(36, 650), color: p.acc, align: "center", at: C.written - s, alpha: cellsA });
    // a pencil line from the note's date to the day it was written
    const u = ph(lt, C.written - s, C.written - s + 0.4, ease.io3);
    arcPath(ctx, NOTE_POS.x + 160, NOTE_POS.y - 190, cellX(0) - 10, CELL.y + 20, -30, u, p.acc, 2.5, 0.7 * cellsA, [2, 8]);
  }
  const a1 = ph(lt, C.written - s + 0.35, C.land1 - s, ease.io3) * cellsA;
  if (a1 > 0) {
    const h = arcPath(ctx, cx(0), by, cx(1), by, 34, a1, p.acc, 4, cellsA);
    if (a1 > 0.95) arrowHead(ctx, h.x, h.y, h.ang, 14, p.acc, cellsA);
    riseLine(ctx, "tomorrow", cx(1), 812, lt, { font: hand(54, 700), color: p.acc, align: "center", at: C.land1 - s, alpha: cellsA });
  }
  // read on Mar 9: the same word now points at Mar 10, which is wrong
  const r0 = ph(lt, C.read - s, C.read - s + 0.3, ease.out3) * cellsA;
  if (r0 > 0) {
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = rgba("#ffffff", r0 * 0.9); ctx.lineWidth = 4;
    rrect(ctx, cellX(6) - 5, CELL.y - 5, CELL.w + 10, CELL.h + 10, 18); ctx.stroke();
    ctx.setLineDash([]);
    riseLine(ctx, "Read", cx(6), CELL.y - 26, lt, { font: sans(36, 650), color: "#ffffff", align: "center", at: C.read - s, alpha: cellsA });
  }
  const a2 = ph(lt, C.read - s + 0.25, C.land2 - s, ease.io3) * cellsA;
  if (a2 > 0) {
    const h = arcPath(ctx, cx(6), by, cx(7), by, 34, a2, "#ffffff", 4, 0.8 * cellsA, [10, 9]);
    if (a2 > 0.95) arrowHead(ctx, h.x, h.y, h.ang, 14, "#ffffff", 0.8 * cellsA);
    riseLine(ctx, "tomorrow?", cx(7), 812, lt, { font: hand(54, 700), color: "#ffffff", align: "center", at: C.land2 - s, alpha: 0.8 * cellsA });
  }
  const x = ph(lt, C.cross - s, C.cross - s + 0.25, ease.out3) * cellsA;
  if (x > 0) {
    const X = cx(7), Y = CELL.y + CELL.h / 2, d = 52;
    line(ctx, X - d, Y - d, X - d + 2 * d * Math.min(1, x * 2), Y - d + 2 * d * Math.min(1, x * 2), "#ff5a7a", 9, cellsA);
    if (x > 0.5) line(ctx, X + d, Y - d, X + d - 2 * d * (x * 2 - 1), Y - d + 2 * d * (x * 2 - 1), "#ff5a7a", 9, cellsA);
  }
  header(ctx, kd, lt, p, 3.35);
}

// ============================================================ 06 SEQUENCE

export const SEQ_Y = 720;

export function sequence(ctx: Ctx, lt: number, t: number) {
  const p = PAL.seq, kd = KINDS[5];
  ground(ctx, p.bg, p.bg2, p.acc, t, 0.08, 960, 640);
  const Y = SEQ_Y;
  const la = ph(lt, -0.5, 0.2, ease.outExpo);
  line(ctx, lerp(960, L, la), Y, lerp(960, R, la), Y, p.ink, 2, 0.35);
  riseLine(ctx, "09:00:00", 960, 500, lt, { font: mono(120, 400), color: p.ink, align: "center", at: 0.05, stagger: 0, out: 3.5 });
  const s = kd.start, C = CUE.seq;
  const tie = ph(lt, C.dropA - s + 0.05, C.dropA - s + 0.35);
  if (tie > 0) line(ctx, 960, 530, 960, lerp(530, Y - 40, tie), p.ink, 2, 0.35, [3, 8]);

  const order = ph(lt, C.order - s, C.order - s + 0.6, ease.spring);
  const jit = lt > C.dropB - s && lt < C.order - s ? Math.sin(lt * 70) * 5 : 0;
  const drop = (at: number) => {
    const u = ph(lt, at - 0.3, at, ease.in2);
    const squash = lt > at ? 1 - 0.25 * Math.exp(-(lt - at) * 14) * Math.cos((lt - at) * 40) : 1;
    return { y: lerp(-80, Y, u), sq: squash, on: u > 0 };
  };
  const A = drop(C.dropA - s), B = drop(C.dropB - s);
  const ax = lerp(934, 840, order) + jit, bx = lerp(986, 1080, order) - jit;
  const ball = (x: number, d: { y: number; sq: number; on: boolean }, fill: string, label: string) => {
    if (!d.on) return;
    ctx.save();
    ctx.translate(x, d.y);
    ctx.scale(1 / d.sq, d.sq);
    glow(ctx, () => dot(ctx, 0, 0, 36, fill), 16, 0.6);
    text(ctx, label, 0, 13, sans(38, 700), "#0b0f0e", 1, "center");
    ctx.restore();
  };
  ball(bx, B, "#f4f7f3", "B");
  ball(ax, A, p.acc, "A");
  // logical order: counters above, an arrow between
  const c1 = ph(lt, C.order - s + 0.3, C.order - s + 0.6, ease.outBack);
  const c2 = ph(lt, C.order - s + 0.42, C.order - s + 0.72, ease.outBack);
  for (const [x, u, n] of [[840, c1, "1"], [1080, c2, "2"]] as const) {
    if (u <= 0) continue;
    ctx.save(); ctx.translate(x, 628); ctx.scale(u, u);
    ctx.strokeStyle = rgba(p.ink, 0.7); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, 28, 0, TAU); ctx.stroke();
    text(ctx, n, 0, 12, mono(34, 600), p.ink, 1, "center");
    ctx.restore();
  }
  const ar = ph(lt, C.order - s + 0.55, C.order - s + 0.85, ease.out3);
  if (ar > 0) {
    line(ctx, 890, Y, lerp(890, 1022, ar), Y, p.acc, 5);
    if (ar > 0.9) arrowHead(ctx, 1030, Y, 0, 16, p.acc);
  }
  payoff(ctx, "Clocks tie. Order doesn't.", lt, C.pay - s, p, 3.5);
  riseLine(ctx, "Lamport, 1978", R, 975, lt, { font: mono(30, 500), color: p.sub, align: "right", at: C.pay - s + 0.35, out: 3.5 });
  header(ctx, kd, lt, p, 3.5);
}

// ============================================================ 07 VERIFICATION

export const STAMP = { x: 1150, y: 570, r: 118, rot: -0.21 };
const CARD7 = { x: 460, y: 380, w: 880, h: 380 };

export function stampMark(ctx: Ctx, x: number, y: number, scale: number, color: string, a: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(STAMP.rot);
  ctx.scale(scale, scale);
  ctx.globalAlpha = a;
  ctx.strokeStyle = color;
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.arc(0, 0, STAMP.r, 0, TAU); ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, STAMP.r - 16, 0, TAU); ctx.stroke();
  text(ctx, "PASSED", 0, 10, sans(46, 800), color, 1, "center", 5);
  text(ctx, "MAR 2024", 0, 50, mono(24, 600), color, 1, "center", 2);
  ctx.restore();
}

export function verify(ctx: Ctx, lt: number, t: number) {
  const p = PAL.verify, kd = KINDS[6];
  ground(ctx, p.bg, p.bg2, p.acc, t, 0.0);
  const { x, y, w, h } = CARD7;
  ctx.save();
  ctx.filter = blurPx(22);
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(x + 8, y + 18, w, h);
  ctx.restore();
  ctx.fillStyle = "#fcfcf8";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = rgba(p.ink, 0.18); ctx.lineWidth = 2;
  ctx.strokeRect(x + 14, y + 14, w - 28, h - 28);
  text(ctx, "Elevator inspection", x + 50, y + 92, sans(46, 650), p.ink);
  line(ctx, x + 50, y + 122, x + w - 50, y + 122, p.ink, 1.5, 0.2);
  text(ctx, "Inspected", x + 50, y + 186, sans(32, 450), p.sub);
  text(ctx, "Mar 2024", x + 50, y + 266, mono(76, 500), p.ink);
  text(ctx, "Cert. 0412", x + 50, y + 330, mono(24, 450), p.sub, 0.7);

  const s = kd.start, C = CUE.verify;
  const age = ph(lt, C.pass - s, C.passEnd - s, ease.io2);
  const stampCol = mix(p.acc, "#a3a39c", age);
  stampMark(ctx, STAMP.x, STAMP.y, 1, stampCol, 1 - 0.75 * age);
  // ink gaps so the stamp reads as pressed, not printed
  for (let i = 0; i < 60; i++) {
    const ang = hash(i * 2.1) * TAU, rr = hash(i * 4.7) * STAMP.r;
    dot(ctx, STAMP.x + Math.cos(ang) * rr, STAMP.y + Math.sin(ang) * rr, 1 + hash(i) * 2.5, "#fcfcf8", 0.55);
  }
  const q = ph(lt, C.passEnd - s + 0.02, C.passEnd - s + 0.4, ease.outBack);
  if (q > 0) {
    ctx.save(); ctx.translate(STAMP.x, STAMP.y + 40); ctx.scale(q, q);
    text(ctx, "?", 0, 0, serif(190, true), p.acc, 1, "center");
    ctx.restore();
  }
  // the months since the check
  const TY = 850, tx0 = x + 50, tx1 = x + w - 50;
  const tr = ph(lt, 0.6, 0.95);
  line(ctx, tx0, TY, tx1, TY, p.ink, 2, 0.18 * tr, [4, 8]);
  for (let i = 0; i <= 31; i++) line(ctx, lerp(tx0, tx1, i / 31), TY - (i % 12 === 0 ? 10 : 5), lerp(tx0, tx1, i / 31), TY + (i % 12 === 0 ? 10 : 5), p.ink, 1.5, 0.3 * tr);
  const mx = lerp(tx0, tx1, age);
  if (tr > 0) {
    line(ctx, tx0, TY, mx, TY, p.ink, 3, tr);
    dot(ctx, mx, TY, 9, p.ink, tr);
    dot(ctx, tx0, TY, 6, p.acc, tr);
  }
  riseLine(ctx, "Today", tx1, TY + 52, lt, { font: sans(38, 600), color: p.ink, align: "center", at: C.passEnd - s - 0.15 });
  payoff(ctx, "True when checked. Unknown since.", lt, C.pay - s, p, undefined, 985);
  header(ctx, kd, lt, p);
}

// ============================================================ 08 ACCESS

const ROWS = [
  { name: "roadmap.pdf", when: "2023", heat: 0.06 },
  { name: "plan.md", when: "today", heat: 1 },
  { name: "notes.md", when: "last week", heat: 0.5 },
];
const SORTED = [1, 2, 0]; // most recently opened first
const PANEL = { x: 500, y: 400, w: 920, row: 104 };
export const ACCESS_SPOT = { x: PANEL.x + 52, y: PANEL.y + 110 + 0 * PANEL.row };

function docIcon(ctx: Ctx, x: number, y: number, color: string, a: number) {
  ctx.strokeStyle = rgba(color, a); ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x, y - 22); ctx.lineTo(x + 20, y - 22); ctx.lineTo(x + 30, y - 12); ctx.lineTo(x + 30, y + 20);
  ctx.lineTo(x, y + 20); ctx.closePath(); ctx.stroke();
}

export function access(ctx: Ctx, lt: number, t: number) {
  const p = PAL.access, kd = KINDS[7];
  ground(ctx, p.bg, p.bg2, p.acc, t, 0.14, 900, 560);
  const s = kd.start, C = CUE.access;
  const pa = ph(lt, -0.2, 0.3);
  ctx.fillStyle = rgba(p.ink, 0.035 * pa);
  rrect(ctx, PANEL.x, PANEL.y, PANEL.w, 440, 22); ctx.fill();
  ctx.strokeStyle = rgba(p.ink, 0.1 * pa); ctx.lineWidth = 1.5; ctx.stroke();
  text(ctx, "Name", PANEL.x + 52, PANEL.y + 58, sans(30, 500), p.sub, pa);
  text(ctx, "Last opened", PANEL.x + PANEL.w - 48, PANEL.y + 58, sans(30, 500), p.sub, pa, "right");
  line(ctx, PANEL.x + 30, PANEL.y + 84, PANEL.x + PANEL.w - 30, PANEL.y + 84, p.ink, 1.5, 0.12 * pa);

  const rowY = (slot: number) => PANEL.y + 110 + slot * PANEL.row + 32;
  const heat = ph(lt, C.heat - s, C.heat - s + 0.5, ease.out3);
  // draw the falling rows first so the rising ones pass over them
  const order = [0, 2, 1];
  for (const i of order) {
    const r = ROWS[i];
    const u = ph(lt, C.sort - s + i * 0.04, C.sort - s + 0.65 + i * 0.04, ease.ioExpo);
    const y = lerp(rowY(i), rowY(SORTED.indexOf(i)), u);
    const a = ph(lt, C.rows - s + i * 0.08, C.rows - s + 0.4 + i * 0.08, ease.out3);
    if (a <= 0) continue;
    const yy = y + (1 - a) * 24;
    const hh = r.heat * heat;
    if (hh > 0) {
      ctx.save();
      ctx.filter = blurPx(26 * hh);
      ctx.fillStyle = rgba(p.acc, 0.22 * hh);
      rrect(ctx, PANEL.x + 16, yy - 52, PANEL.w - 32, 86, 16); ctx.fill();
      ctx.restore();
      ctx.fillStyle = rgba(p.acc, 0.12 * hh);
      rrect(ctx, PANEL.x + 16, yy - 52, PANEL.w - 32, 86, 16); ctx.fill();
      ctx.fillStyle = rgba(p.acc, hh);
      rrect(ctx, PANEL.x + 16, yy - 40, 6, 62, 3); ctx.fill();
    }
    docIcon(ctx, PANEL.x + 52, yy - 14, p.ink, a * 0.8);
    text(ctx, r.name, PANEL.x + 108, yy, sans(46, 500), p.ink, a);
    text(ctx, r.when, PANEL.x + PANEL.w - 48, yy, sans(44, 500), mix(p.sub, p.acc, hh), a, "right");
  }
  payoff(ctx, "Read most, check first.", lt, C.pay - s, p);
  header(ctx, kd, lt, p);
}

// ============================================================ 09 VOLATILITY

const TUBES = [
  { x: 700, name: "Status", life: "7 days", days: 7 },
  { x: 960, name: "Decision", life: "90 days", days: 90 },
  { x: 1220, name: "Name", life: "never", days: Infinity },
];
const TUBE = { top: 400, h: 330, w: 140 };

export function volLevels(lt: number) {
  const s = KINDS[8].start, C = CUE.vol;
  const day = 120 * ph(lt, C.count - s, C.countEnd - s, ease.io2);
  const drain = ph(lt, 3.35, 4.1, ease.in2);
  return { day, levels: TUBES.map((tb) => clamp(1 - day / tb.days) * (1 - drain)) };
}

export function volatility(ctx: Ctx, lt: number, t: number) {
  const p = PAL.vol, kd = KINDS[8];
  ground(ctx, p.bg, p.bg2, "#ffffff", t, 0.25, 960, 560);
  const { day, levels } = volLevels(lt);
  TUBES.forEach((tb, i) => {
    const a = ph(lt, 0.0 + i * 0.07, 0.4 + i * 0.07, ease.out3);
    const x0 = tb.x - TUBE.w / 2, y0 = TUBE.top + (1 - a) * 40, bot = y0 + TUBE.h;
    const lv = levels[i] * ph(lt, -0.1, 0.45, ease.out3);
    const empty = lv <= 0.001 && lt > 0.6;
    // liquid
    ctx.save();
    rrect(ctx, x0, y0, TUBE.w, TUBE.h, 26); ctx.clip();
    const sy = bot - TUBE.h * lv;
    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.moveTo(x0, bot);
    for (let x = 0; x <= TUBE.w; x += 6) ctx.lineTo(x0 + x, sy + Math.sin(x / 18 + t * 7 + i) * (lv > 0 && lv < 1 ? 5 : 2));
    ctx.lineTo(x0 + TUBE.w, bot); ctx.closePath(); ctx.fill();
    for (let b = 0; b < 6; b++) {
      const by = bot - ((t * 60 + hash(b + i * 9) * 400) % (TUBE.h * lv + 1));
      if (by > sy + 8) dot(ctx, x0 + 20 + hash(b * 3 + i) * (TUBE.w - 40), by, 3 + hash(b) * 3, p.bg2, 0.35);
    }
    ctx.restore();
    ctx.strokeStyle = rgba(p.ink, a * (empty ? 0.45 : 1));
    ctx.lineWidth = 4;
    ctx.setLineDash(empty ? [10, 10] : []);
    rrect(ctx, x0, y0, TUBE.w, TUBE.h, 26); ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, tb.name, tb.x, bot + 70, sans(46, 650), p.ink, a * (empty ? 0.55 : 1), "center");
    text(ctx, tb.life, tb.x, bot + 118, mono(36, 500), p.sub, a, "center");
  });
  const ca = ph(lt, 0.3, 0.6);
  text(ctx, "Day", R, 470, sans(36, 600), p.sub, ca, "right");
  text(ctx, String(Math.round(day)), R, 580, mono(110, 500), p.ink, ca, "right");
  payoff(ctx, "Facts have half-lives.", lt, CUE.vol.pay - kd.start, p, 3.4);
  header(ctx, kd, lt, p, 3.4);
}

// ============================================================ 10 INTENDED

export const INT = { y: 700, now: 640, step: 135 };

export function intendLine(ctx: Ctx, lt: number, p: Pal, a: number) {
  const { y, now } = INT;
  const la = ph(lt, -0.6, 0.25, ease.outExpo);
  line(ctx, L, y, lerp(L, now, la), y, p.ink, 3, 0.75 * a);
  line(ctx, now, y, lerp(now, R, la), y, p.ink, 3, 0.45 * a, [6, 12]);
}

export function intended(ctx: Ctx, lt: number, t: number) {
  const p = PAL.intend, kd = KINDS[9];
  ground(ctx, p.bg, p.bg2, p.acc, t, 0.16, 1200, 600);
  const s = kd.start, C = CUE.intend;
  const fade = 1 - ph(lt, 3.3, 3.65);
  const { y, now, step } = INT;
  if (lt < 3.3) intendLine(ctx, lt, p, 1);
  // past glows dimmer than the future reads, the future is where this time lives
  const days = ["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];
  days.forEach((d, i) => {
    const x = now + (i + 1) * step;
    const a = ph(lt, 0.15 + i * 0.04, 0.5 + i * 0.04) * fade;
    line(ctx, x, y - 8, x, y + 8, p.ink, 2, 0.5 * a);
    text(ctx, d, x, y + 50, mono(30, 500), i === 4 && lt > C.land - s ? p.ink : p.sub, a, "center");
  });
  const na = ph(lt, 0.0, 0.35) * fade;
  line(ctx, now, y - 70, now, y + 70, p.ink, 3, na);
  glow(ctx, () => dot(ctx, now, y, 10, p.ink, na), 16, na);
  text(ctx, "Now", now, y + 118, sans(44, 650), p.ink, na, "center");

  // the reminder is typed, then leaps forward
  const pa = ph(lt, C.type - s - 0.2, C.type - s + 0.1) * fade;
  if (pa > 0) {
    ctx.font = sans(46, 500);
    const msg = "Remind me next Tuesday";
    const w = ctx.measureText(msg).width;
    ctx.fillStyle = rgba("#ffffff", 0.07 * pa);
    rrect(ctx, L, 448, w + 64, 92, 46); ctx.fill();
    ctx.strokeStyle = rgba(p.acc, 0.6 * pa); ctx.lineWidth = 2; ctx.stroke();
    ctx.globalAlpha = pa;
    typed(ctx, msg, L + 32, 510, lt, C.type - s, 30, sans(46, 500), p.ink, lt < C.leap - s);
    ctx.globalAlpha = 1;
    // a tether from the request to now
    const ta = ph(lt, C.leap - s - 0.25, C.leap - s);
    arcPath(ctx, L + 120, 540, now - 6, y - 70, 20, ta, p.acc, 2, 0.5 * pa, [2, 8]);
  }
  const tx = now + 5 * step;
  const lu = ph(lt, C.leap - s, C.land - s, ease.io2);
  if (lu > 0) {
    const h = arcPath(ctx, now, y - 4, tx, y - 4, -130, lu, p.acc, 4, 0.9 * fade, lu < 1 ? [] : [12, 10]);
    if (lu < 1) glow(ctx, () => dot(ctx, h.x, h.y, 9, "#ffffff"), 18);
  }
  if (lt >= C.land - s) {
    const sl = lt - (C.land - s);
    rings(ctx, tx, y, sl, p.acc, 2, 160, 1.0);
    const fl = ph(sl, 0, 0.35, ease.outBack) * fade;
    line(ctx, tx, y, tx, y - 96 * fl, p.ink, 3, fade);
    ctx.fillStyle = rgba(p.acc, fade);
    ctx.beginPath(); ctx.moveTo(tx, y - 96 * fl); ctx.lineTo(tx + 52 * fl, y - 80 * fl); ctx.lineTo(tx, y - 64 * fl); ctx.fill();
    glow(ctx, () => dot(ctx, tx, y, 9, p.acc, fade), 16, fade);
  }
  payoff(ctx, "It points forward.", lt, C.pay - s, p, 3.3);
  header(ctx, kd, lt, p, 3.3);
}

// ============================================================ 11 BUSINESS

export const RING = { x: 1220, y: 600, r: 300 };
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const APR6 = 31 + 28 + 31 + 5; // day offset of April 6

export function busRotation(lt: number) {
  const s = KINDS[10].start, C = CUE.bus;
  const base = -(APR6 / 365) * TAU * ease.spring(inv(C.rotate - s, C.lock - s + 0.2, lt));
  // the whip winds the ring up before the cut
  return base - Math.pow(ph(lt, 3.35, 3.9, ease.lin), 2.2) * TAU * 0.3;
}

export function ringShape(ctx: Ctx, rot: number, p: Pal, a: number, circle = true, labels = true) {
  const { x, y, r } = RING;
  if (circle) {
    ctx.strokeStyle = rgba(p.ink, 0.5 * a); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  }
  let d = 0;
  for (let m = 0; m < 12; m++) {
    const ang = rot + (d / 365) * TAU - TAU / 4;
    line(ctx, x + Math.cos(ang) * (r - 16), y + Math.sin(ang) * (r - 16), x + Math.cos(ang) * (r + 16), y + Math.sin(ang) * (r + 16), p.ink, 3, 0.7 * a);
    if (labels) {
      const mid = rot + ((d + MDAYS[m] / 2) / 365) * TAU - TAU / 4;
      text(ctx, MONTHS[m], x + Math.cos(mid) * (r + 54), y + Math.sin(mid) * (r + 54) + 11, mono(30, 500), p.ink, 0.75 * a, "center");
    }
    d += MDAYS[m];
  }
  for (let i = 0; i < 365; i += 7) {
    const ang = rot + (i / 365) * TAU - TAU / 4;
    line(ctx, x + Math.cos(ang) * (r - 6), y + Math.sin(ang) * (r - 6), x + Math.cos(ang) * r, y + Math.sin(ang) * r, p.ink, 1.5, 0.3 * a);
  }
}

export function business(ctx: Ctx, lt: number, t: number) {
  const p = PAL.bus, kd = KINDS[10];
  ground(ctx, p.bg, p.bg2, p.acc, t, 0.1, RING.x, RING.y);
  const s = kd.start, C = CUE.bus;
  const rot = busRotation(lt);
  const show = lt >= 0.33;
  // until the curl lands, the transition draws the circle and only the ticks and months fade in here
  ringShape(ctx, rot, p, show ? 1 : ph(lt, 0.0, 0.33), show);
  // the gold year from the start mark round the ring
  const yr = ph(lt, C.lock - s + 0.05, C.lock - s + 0.75, ease.io3) * (1 - ph(lt, 3.35, 3.5));
  if (yr > 0) {
    ctx.strokeStyle = p.acc; ctx.lineWidth = 8; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(RING.x, RING.y, RING.r, -TAU / 4, -TAU / 4 + TAU * yr); ctx.stroke();
  }
  // the fixed pointer at the top: where the year starts
  const pa = ph(lt, 0.2, 0.5);
  ctx.fillStyle = rgba(p.acc, pa);
  ctx.beginPath();
  ctx.moveTo(RING.x, RING.y - RING.r - 6);
  ctx.lineTo(RING.x - 16, RING.y - RING.r - 34);
  ctx.lineTo(RING.x + 16, RING.y - RING.r - 34);
  ctx.fill();

  const sw = ph(lt, C.lock - s - 0.3, C.lock - s + 0.1, ease.io3);
  const out = 1 - ph(lt, 3.35, 3.55);
  if (sw < 1) text(ctx, "Jan 1", RING.x, RING.y + 30 - sw * 40, serif(118), p.ink, ph(lt, 0.25, 0.6) * (1 - sw) * out, "center");
  if (sw > 0) {
    text(ctx, "Apr 6", RING.x, RING.y + 30 + (1 - sw) * 40, serif(118), p.ink, sw * out, "center");
    text(ctx, "UK tax year", RING.x, RING.y + 96 + (1 - sw) * 30, sans(40, 600), p.acc, sw * out, "center");
  }
  payoff(ctx, "A leftover from 1752.", lt, C.pay - s, p, 3.4);
  header(ctx, kd, lt, p, 3.4);
}

// ============================================================ 12 AS-OF

const AX = (yr: number) => yrX(yr, 1930, 2026);
export const ASOF_Y = 800;

export function asofYear(lt: number) {
  const s = KINDS[11].start, C = CUE.asof;
  const back = ph(lt, C.back - s, C.backEnd - s, ease.ioExpo);
  const fwd = ph(lt, C.fwd - s, C.fwdEnd - s, ease.ioExpo);
  return 2026 - 21 * back + 21 * fwd;
}

function flap(ctx: Ctx, from: string, to: string, u: number, x: number, y: number, font: string, color: string, h: number) {
  // a split-flap change: the top half of the new value, the bottom half of the old, a folding leaf between
  const half = (s: string, top: boolean, sy = 1) => {
    ctx.save();
    ctx.beginPath();
    if (top) ctx.rect(x - 200, y - h, 400, h); else ctx.rect(x - 200, y, 400, h);
    ctx.clip();
    ctx.translate(x, y); ctx.scale(1, sy); ctx.translate(-x, -y);
    text(ctx, s, x, y + 92, font, color, 1, "center");
    ctx.restore();
  };
  if (u <= 0 || from === to) { half(from, true); half(from, false); return; }
  if (u >= 1) { half(to, true); half(to, false); return; }
  half(to, true);
  half(from, false);
  if (u < 0.5) half(from, true, 1 - u * 2);
  else half(to, false, (u - 0.5) * 2);
  line(ctx, x - 110, y, x + 110, y, "#000000", 3, 0.5);
}

export function asof(ctx: Ctx, lt: number, t: number) {
  const p = PAL.asof, kd = KINDS[11];
  ground(ctx, p.bg, p.bg2, p.acc, t, 0.1, 1100, 560);
  stars(ctx, t, p.ink, 60, 77, 0.5);
  const Y = ASOF_Y;
  const la = ph(lt, -0.4, 0.3, ease.outExpo);
  line(ctx, lerp(960, L, la), Y, lerp(960, R, la), Y, p.ink, 2, 0.4);
  for (let yr = 1930; yr <= 2026; yr += 10) {
    const x = AX(yr);
    line(ctx, x, Y - 7, x, Y + 7, p.ink, 2, 0.35 * la);
    if ((yr - 1930) % 20 === 0 && yr < 2000) text(ctx, String(yr), x, Y + 48, mono(28), p.sub, 0.7 * la, "center");
  }
  // a quiet callback: the span when Pluto counted
  ctx.fillStyle = rgba(PAL.valid.acc, 0.55 * ph(lt, 0.3, 0.7));
  rrect(ctx, AX(1930), Y - 5, AX(2006) - AX(1930), 10, 5); ctx.fill();
  text(ctx, "2006", AX(2006), Y + 48, mono(28, 600), p.ink, 0.8 * ph(lt, 0.3, 0.7), "center");

  const yr = asofYear(lt);
  const pluto = yr < 2006.65;
  const s = kd.start, C = CUE.asof;
  // the question and its answer
  riseLine(ctx, "How many planets?", L, 560, lt, { font: serif(80), color: p.ink, at: 0.25 });
  // the scrub passes Pluto's 2006 at these moments (ioExpo solved for the year 2006.65)
  const crossB = C.flip9 - s, crossF = C.flip8 - s;
  let from = "8", to = "8", u = 0;
  if (lt >= crossB && lt < crossF) { from = "8"; to = "9"; u = ph(lt, crossB, crossB + 0.28); }
  else if (lt >= crossF) { from = "9"; to = "8"; u = ph(lt, crossF, crossF + 0.28); }
  const na = ph(lt, 0.4, 0.7);
  ctx.globalAlpha = na;
  flap(ctx, from, to, u, 1010, 520, serif(260), p.ink, 150);
  ctx.globalAlpha = 1;
  // the planets themselves, Pluto last
  for (let i = 0; i < 9; i++) {
    const x = 1200 + i * 62, isPluto = i === 8;
    const pa = isPluto ? (pluto ? ph(lt, crossB, crossB + 0.3, ease.outBack) : 0) : ph(lt, 0.5 + i * 0.04, 0.8 + i * 0.04);
    if (pa <= 0) continue;
    const r = [7, 10, 10, 8, 20, 18, 14, 14, 6][i];
    if (isPluto) glow(ctx, () => dot(ctx, x, 500, r * pa, p.acc), 14);
    else dot(ctx, x, 500, r, p.ink, 0.85 * pa);
  }
  // the as-of handle
  const hx = AX(yr);
  const ha = ph(lt, 0.3, 0.6);
  line(ctx, hx, Y - 64, hx, Y + 22, p.acc, 4, ha);
  glow(ctx, () => dot(ctx, hx, Y, 11, p.acc, ha), 16, ha);
  const label = yr > 2025.5 ? "As of today" : `As of ${Math.round(yr)}`;
  text(ctx, label, Math.min(hx, R - 4), Y - 86, sans(42, 650), p.ink, ha, hx > R - 140 ? "right" : "center");
  header(ctx, kd, lt, p);
}

export const PAINTERS = [event, valid, record, source, reference, sequence, verify, access, volatility, intended, business, asof];
