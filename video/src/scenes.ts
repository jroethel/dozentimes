import {
  W, H, INK, DIM, FAINT, HAIR, type Scene, clamp, lerp, ease,
  phase, stag, sceneAt, SCENES,
} from "./timeline.ts";
import type { Ctx } from "./draw.ts";
import {
  MONO, DISP, trackText, widthTracked, typeText, ph, grain, vign,
  head, header, caption, dot, chipBox, glowDot, axis, glowText, tag,
} from "./draw.ts";

// ---------------------------------------------------------------------------
// Shared card helper: hairline box + mono title + small tags underneath
function card(ctx: Ctx, x: number, y: number, w: number, h: number, accent: string, alpha = 1, r = 12) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(237,234,227,0.045)";
  ctx.strokeStyle = "rgba(237,234,227,0.28)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.stroke();
  // accent notch on the left edge
  ctx.fillStyle = accent;
  ctx.fillRect(x - 5, y + 18, 4, h - 36);
  ctx.restore();
}

function strike(ctx: Ctx, x1: number, y: number, x2: number, color: string, u: number) {
  if (u <= 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(lerp(x1, x2, u), y); ctx.stroke();
  ctx.restore();
}

const shake = (lt: number, t0: number, freq = 42, amp = 4, decay = 3.2) =>
  (lt > t0 ? Math.sin((lt - t0) * freq) * amp * Math.exp(-(lt - t0) * decay) : 0);

// stamp: slams in with overshoot at t0, optional peel-out at t1
function stamp(ctx: Ctx, s: string, x: number, y: number, size: number, accent: string, lt: number, t0: number, t1?: number) {
  let a = 1, sc = 1, rot = -0.10, dx = 0, dy = 0;
  const u = ph(lt, t0, t0 + 0.22, ease.oBack);
  if (lt < t0) return;
  sc = lerp(2.2, 1, u);
  a = ph(lt, t0, t0 + 0.1);
  if (t1 !== undefined && lt > t1) {
    const v = ph(lt, t1, t1 + 0.5);
    a = 1 - v;
    rot = -0.10 + v * 0.35;
    dx = v * 130;
    dy = v * 90;
  }
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(x + dx, y + dy);
  ctx.rotate(rot);
  ctx.scale(sc, sc);
  ctx.font = MONO(size);
  const w = widthTracked(ctx, s, 4);
  chipBox(ctx, -w / 2 - 18, -size, w + 36, size + 24, accent, undefined, 6);
  ctx.fillStyle = accent;
  trackText(ctx, s, -w / 2, y * 0 + size * 0.72 - 2, 4);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// HOOK
function hook(ctx: Ctx, lt: number, frame: number) {
  const s = { accent: INK } as Scene;
  // L1 typewriter
  const u1 = ph(lt, 0.45, 2.05, (t) => t);
  ctx.save();
  ctx.globalAlpha = ph(lt, 0.4, 0.6) * (1 - ph(lt, 3.35, 3.9));
  ctx.fillStyle = DIM;
  ctx.font = MONO(40);
  typeText(ctx, "If I told you a dozen times,", 0, 0, 0); // width computed below
  ctx.restore();
  // (draw properly, centered)
  ctx.save();
  const exit = ph(lt, 3.3, 3.85);
  const a1 = ph(lt, 0.4, 0.6) * (1 - exit);
  ctx.globalAlpha = a1;
  ctx.font = MONO(40);
  const L1 = "If I told you a dozen times,";
  const w1 = widthTracked(ctx, L1.slice(0, Math.round(L1.length * u1)), 3);
  ctx.fillStyle = DIM;
  trackText(ctx, L1.slice(0, Math.round(L1.length * u1)), W / 2 - w1 / 2, 452 - 26 * exit, 3);
  // caret
  if (u1 < 1 && a1 > 0.5) {
    ctx.fillStyle = INK;
    ctx.fillRect(W / 2 + w1 / 2 + 6, 452 - 32, 3, 38);
  }
  ctx.restore();

  // L2
  const a2 = ph(lt, 2.25, 2.85) * (1 - ph(lt, 3.3, 3.85));
  ctx.save();
  ctx.globalAlpha = a2;
  ctx.fillStyle = INK;
  ctx.font = DISP(74);
  ctx.textAlign = "center";
  ctx.fillText("you'd remember.", W / 2, 580 - 26 * exit);
  ctx.textAlign = "left";
  ctx.restore();

  // L3 thesis: swap in
  const a3 = ph(lt, 3.45, 4.05, ease.o);
  const y3 = lerp(585, 520, a3);
  ctx.save();
  ctx.globalAlpha = a3;
  ctx.fillStyle = INK;
  ctx.font = DISP(88);
  ctx.textAlign = "center";
  ctx.fillText("“When” is not one question.", W / 2, y3);
  ctx.textAlign = "left";
  ctx.restore();

  // L4 "It's twelve." + twelve ticks foreshadowing the grid
  const a4 = ph(lt, 4.35, 4.85);
  ctx.save();
  ctx.globalAlpha = a4;
  ctx.font = MONO(34);
  ctx.fillStyle = DIM;
  const t4 = "It's twelve.";
  const w4 = widthTracked(ctx, t4, 4);
  trackText(ctx, t4, W / 2 - w4 / 2, 628, 4);
  // 12 ticks light up sequentially
  const n = 12;
  for (let i = 0; i < n; i++) {
    const li = ph(lt, 4.5 + i * 0.05, 4.7 + i * 0.05);
    const x = W / 2 + (i - (n - 1) / 2) * 52;
    ctx.globalAlpha = a4 * (0.18 + 0.72 * li);
    ctx.fillStyle = i < 1 ? INK : INK;
    ctx.fillRect(x - 2, 690 - 14 * li, 4, 14 + 10 * li);
  }
  ctx.restore();

  // final brightening
  ctx.save();
  ctx.globalAlpha = 0.5 * ph(lt, 5.15, 5.5);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  void s;
}

// ---------------------------------------------------------------------------
// 01 EVENT
function event(ctx: Ctx, lt: number, frame: number) {
  const s = SCENES[1];
  header(ctx, s, lt);
  caption(ctx, s, lt);

  const ax1 = 220, ax2 = 1700, ay = 560;
  // question chip types in
  ctx.save();
  ctx.font = MONO(31);
  const q = "what shipped in September?";
  const uq = ph(lt, 0.35, 1.1, (t) => t);
  const qw = widthTracked(ctx, q, 2);
  const qx = W / 2 - qw / 2, qy = 268;
  ctx.globalAlpha = ph(lt, 0.3, 0.5);
  ctx.strokeStyle = "rgba(237,234,227,0.25)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(qx - 26, qy - 40, qw + 52, 62, 31); ctx.stroke();
  ctx.fillStyle = INK;
  typeText(ctx, q, qx, qy + 2, uq, 2);
  ctx.restore();

  // axis + month labels
  const months = ["AUG", "SEP", "OCT"];
  const mw = (ax2 - ax1) / 3;
  const winX1 = ax1 + mw, winX2 = ax1 + 2 * mw;
  const ua = ph(lt, 0.5, 1.1, ease.o);
  ctx.save();
  ctx.globalAlpha = 1;
  axis(ctx, lerp(W / 2, ax1, ua), lerp(W / 2, ax2, ua), ay, (i) => months[i], 2, "rgba(237,234,227,0.45)");
  ctx.restore();

  // september window illuminates
  const uw = ph(lt, 1.25, 1.85);
  if (uw > 0) {
    ctx.save();
    ctx.globalAlpha = 0.10 * uw;
    ctx.fillStyle = s.accent;
    ctx.fillRect(winX1, ay - 130, winX2 - winX1, 260);
    ctx.globalAlpha = 0.9 * uw;
    ctx.strokeStyle = s.accent;
    ctx.setLineDash([6, 7]);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(winX1, ay - 130, winX2 - winX1, 260);
    ctx.restore();
    tag(ctx, "THE QUESTION'S WINDOW", (winX1 + winX2) / 2, ay - 102, s.accent, "center", uw, 18);
  }

  // commit dots along the axis (d = fraction of the AUG..OCT span)
  const dots: Array<{ d: number; label?: string; in: boolean }> = [
    { d: 0.10 }, { d: 0.22 }, { d: 0.301, label: "AUG 28", in: false },
    { d: 0.365, label: "SEP 3", in: true },
    { d: 0.516, label: "SEP 17", in: true },
    { d: 0.612, label: "SEP 26", in: true },
    { d: 0.688, label: "OCT 2", in: false },
    { d: 0.97 },
  ];
  dots.forEach((dd, i) => {
    const appear = ph(lt, 0.7 + i * 0.06, 0.95 + i * 0.06, ease.o);
    if (appear <= 0) return;
    const x = lerp(ax1, ax2, dd.d);
    const lit = dd.in && uw > 0.5;
    // dropped dots slide out
    let ox = 0, oa = 1;
    if (dd.label && !dd.in && uw > 0.9) {
      const v = ph(lt, 2.5, 3.3);
      ox = (dd.d < 0.5 ? -1 : 1) * v * 200;
      oa = 1 - v;
    }
    dot(ctx, x + ox, ay, lit ? 9 : 6, lit ? s.accent : "rgba(237,234,227,0.5)", appear * oa);
    if (lit && dd.label) {
      glowDot(ctx, x, ay, 8, s.accent, appear * oa * 0.85);
      // lift + tag above the window
      const lift = ph(lt, 1.9 + i * 0.07, 2.5 + i * 0.07, ease.oBack);
      if (lift > 0) {
        const y = lerp(ay - 26, ay - 190, ease.o(lift));
        ctx.save();
        ctx.globalAlpha = lift;
        ctx.strokeStyle = "rgba(237,234,227,0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, ay - 10); ctx.lineTo(x, y + 12); ctx.stroke();
        ctx.restore();
        tag(ctx, dd.label, x, y, INK, "center", lift, 22);
      }
    }
  });

  // reading head parks at the window edge
  const uh = ph(lt, 3.3, 3.9, ease.o);
  if (uh > 0) head(ctx, lerp(ax1, winX1, uh), ay - 190, ay + 60, INK, uh);
}

// ---------------------------------------------------------------------------
// 02 VALID
function valid(ctx: Ctx, lt: number, frame: number) {
  const s = SCENES[2];
  header(ctx, s, lt);
  caption(ctx, s, lt);

  const ax1 = 380, ax2 = 1540, ay = 560;
  const bx = lerp(ax1, ax2, 0.62); // boundary OCT 14

  // card 1: old Next
  const c1a = ph(lt, 0.25, 0.6, ease.o);
  card(ctx, lerp(560, 560, c1a), 280, 800, 96, s.accent, c1a);
  ctx.save();
  ctx.globalAlpha = c1a;
  ctx.font = MONO(36);
  ctx.fillStyle = INK;
  const t1 = "Next: ship the importer";
  ctx.fillText(t1, 620, 340);
  ctx.restore();

  // card 2: new Next
  const c2a = ph(lt, 1.15, 1.5, ease.o);
  if (c2a > 0) {
    card(ctx, 560, 620, 800, 96, s.accent, c2a);
    ctx.save();
    ctx.globalAlpha = c2a;
    ctx.font = MONO(36);
    ctx.fillStyle = INK;
    ctx.fillText("Next: beta invites", 620, 680);
    ctx.restore();
  }

  // axis with boundary flag
  const ua = ph(lt, 0.5, 1.0, ease.o);
  ctx.save();
  ctx.globalAlpha = 1;
  axis(ctx, lerp(W / 2, ax1, ua), lerp(W / 2, ax2, ua), ay, null, 0);
  ctx.restore();
  const ub = ph(lt, 0.9, 1.35);
  if (ub > 0) {
    ctx.save();
    ctx.globalAlpha = ub;
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 6]);
    ctx.beginPath(); ctx.moveTo(bx, ay - 130); ctx.lineTo(bx, ay + 220); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = MONO(24);
    ctx.fillStyle = s.accent;
    trackText(ctx, "SWAPPED OCT 14", bx + 14, ay - 104, 2);
    ctx.restore();
  }

  // reading head sweeps; state flips at boundary
  const sweep = ph(lt, 1.7, 3.3, (t) => t);
  const hx = lerp(ax1 - 40, ax2 + 40, sweep);
  const crossed = hx > bx;
  head(ctx, hx, ay - 130, ay + 200, INK, 1);

  // states
  const before = !crossed;
  const flip = ph(lt, 0, 0.001) + (before ? 0 : 1);
  ctx.save();
  // card1 highlight before, strike+replaced after
  ctx.globalAlpha = 1;
  ctx.font = MONO(23);
  if (before) {
    ctx.globalAlpha = (sweep > 0.02 ? 1 : 0.4) * c1a;
    ctx.fillStyle = s.accent;
    trackText(ctx, "CURRENT THEN", 620, 300, 3);
  } else {
    ctx.fillStyle = s.accent;
    strike(ctx, 618, 332, 618 + ctx.measureText("Next: ship the importer").width + 4, s.accent,
      ph(lt, 2.55, 2.85));
    ctx.globalAlpha = ph(lt, 2.85, 3.1);
    trackText(ctx, "REPLACED", 620, 300, 3);
  }
  ctx.restore();
  // card2 highlight after
  ctx.save();
  ctx.font = MONO(23);
  if (crossed) {
    ctx.fillStyle = s.accent;
    trackText(ctx, "CURRENT NOW", 620, 640, 3);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 03 RECORD
function record(ctx: Ctx, lt: number, frame: number) {
  const s = SCENES[3];
  header(ctx, s, lt);
  caption(ctx, s, lt);

  const ax1 = 260, ax2 = 1660, ay = 545;
  // date mapping: Sep 10(0) Sep 15(0.25) Sep 20(0.5) Sep 25(0.75) Oct 1(1)
  const xof = (d: number) => lerp(ax1, ax2, d);
  axis(ctx, ax1, ax2, ay, (i) => ["SEPT 10", "SEPT 15", "SEPT 20", "SEPT 25", "OCT 1"][i], 4,
    "rgba(237,234,227,0.4)");

  // lane labels
  ctx.save();
  ctx.font = MONO(22);
  ctx.fillStyle = DIM;
  trackText(ctx, "WHAT HAPPENED", 150, 388, 3, "left");
  trackText(ctx, "WHAT WE WROTE DOWN", 150, 712, 3, "left");
  ctx.restore();

  // lane 1: the event spark at Sep 12
  const evX = xof(0.10);
  const ue = ph(lt, 0.45, 0.85, ease.oBack);
  glowDot(ctx, evX, 380, 10, s.accent, ue);
  tag(ctx, "it happened - SEPT 12", evX + 10, 336, INK, "center", ue, 23);

  // lane 2: the record appears at Oct 1
  const ur = ph(lt, 1.15, 1.6, ease.o);
  if (ur > 0) {
    // pen line draws rightward from Oct 1
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(xof(1.0), 700);
    ctx.lineTo(lerp(xof(1.0), xof(1.0) + 130, ur), 700);
    ctx.stroke();
    ctx.restore();
    glowDot(ctx, xof(1.0), 700, 8, INK, ur);
    tag(ctx, "written down - OCT 1", xof(1.0) + 40, 664, INK, "center", ur, 23);
  }

  // reading head at Sep 15
  const uh = ph(lt, 1.8, 2.3, ease.o);
  if (uh > 0) {
    head(ctx, xof(0.25), 300, 760, INK, uh);
    tag(ctx, "reading at SEPT 15", xof(0.25), 286, DIM, "center", uh, 22);
  }

  // the blind spot: between event and record, shaded
  const ub = ph(lt, 2.3, 2.9);
  if (ub > 0) {
    ctx.save();
    ctx.globalAlpha = 0.07 * ub;
    ctx.fillStyle = s.accent;
    ctx.fillRect(evX, ay - 190, xof(1.0) - evX, 380);
    ctx.restore();
    tag(ctx, "THE BLIND SPOT", (evX + xof(1.0)) / 2, 392, s.accent, "center", ub, 19);
    // empty circle where the answer would need to be
    ctx.save();
    ctx.globalAlpha = ub;
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.arc(xof(0.25), 700, 12, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = MONO(22);
    ctx.fillStyle = s.accent;
    trackText(ctx, "not yet known", xof(0.25) + 26, 707, 2, "left");
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// 04 SOURCE
function source(ctx: Ctx, lt: number, frame: number) {
  const s = SCENES[4];
  header(ctx, s, lt);
  caption(ctx, s, lt);

  const drawFileCard = (x: number, y: number, title: string, engraving: string, a: number, glow: number) => {
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    card(ctx, x, y, 430, 250, s.accent, 1);
    ctx.font = MONO(34);
    ctx.fillStyle = INK;
    ctx.fillText(title, x + 36, y + 70);
    ctx.font = MONO(20);
    ctx.fillStyle = DIM;
    ctx.fillText("no dated headings", x + 36, y + 104);
    // engraved date
    ctx.font = MONO(30);
    ctx.fillStyle = `rgba(237,234,227,${0.5 + 0.5 * glow})`;
    if (glow > 0) { ctx.shadowColor = s.accent; ctx.shadowBlur = 24 * glow; }
    ctx.fillText(engraving, x + 36, y + 190);
    ctx.restore();
  };

  drawFileCard(330, 350, "notes.md", "WRITTEN AUG 1", ph(lt, 0.25, 0.6, ease.o), 0);

  // stamp 1 slams + peels (centered on the card's empty middle band)
  stamp(ctx, "IMPORTED OCT 22", 545, 485, 30, s.accent, lt, 0.8, 1.7);
  // clone card slides in
  const uc = ph(lt, 2.0, 2.5, ease.o);
  if (uc > 0) {
    ctx.save();
    ctx.globalAlpha = uc;
    ctx.translate(lerp(180, 0, uc), 0);
    drawFileCard(1160, 350, "notes.md", "WRITTEN AUG 1", 1, 0);
    ctx.restore();
    tag(ctx, "a fresh clone", 1375, 650, DIM, "center", uc, 21);
  }
  stamp(ctx, "CLONED TODAY", 1375, 485, 28, s.accent, lt, 2.6, 3.3);

  // engraving glows on both
  const ug = ph(lt, 3.3, 3.9);
  if (ug > 0) {
    ctx.save();
    ctx.font = MONO(30);
    ctx.shadowColor = s.accent;
    ctx.shadowBlur = 26;
    ctx.fillStyle = INK;
    ctx.globalAlpha = ug;
    ctx.fillText("WRITTEN AUG 1", 366, 540);
    ctx.fillText("WRITTEN AUG 1", 1196, 540);
    ctx.restore();
    tag(ctx, "THE ONLY DATE THAT SURVIVES THE COPY", 960, 660, s.accent, "center", ug, 20);
  }
}

// ---------------------------------------------------------------------------
// 05 REFERENCE
function reference(ctx: Ctx, lt: number, frame: number) {
  const s = SCENES[5];
  header(ctx, s, lt);
  caption(ctx, s, lt);

  // phrase chip
  ctx.save();
  ctx.font = DISP(56);
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  const ua = ph(lt, 0.3, 0.8, ease.o);
  ctx.globalAlpha = ua;
  ctx.fillText("“last week”", W / 2, 300);
  ctx.textAlign = "left";
  ctx.restore();

  // 4-week strip
  const weeks = ["SEPT 28 - OCT 4", "OCT 5 - OCT 11", "OCT 12 - OCT 18", "OCT 19 - OCT 25"];
  const bx1 = 300, bx2 = 1620, by = 480, bh = 130;
  const bw = (bx2 - bx1) / 4;
  const stripA = ph(lt, 0.6, 1.05, ease.o);
  for (let i = 0; i < 4; i++) {
    const ai = stag(ph(lt, 0.6, 1.5), 0, 1, i, 0.001) * stripA; // all with strip
    chipBox(ctx, bx1 + i * bw + 8, by, bw - 16, bh, "rgba(237,234,227,0.25)", undefined, 8);
    ctx.save();
    ctx.globalAlpha = stripA;
    ctx.font = MONO(21);
    ctx.fillStyle = DIM;
    trackText(ctx, weeks[i], bx1 + i * bw + bw / 2, by + bh / 2 + 7, 1, "center");
    ctx.restore();
  }

  // moment A: said on Sunday Oct 11 -> lights week 1
  const aA = ph(lt, 1.3, 1.7);
  if (aA > 0) {
    ctx.save();
    ctx.globalAlpha = aA;
    // highlight week 0
    ctx.fillStyle = s.accent;
    ctx.globalAlpha = aA * 0.16;
    ctx.fillRect(bx1 + 8, by, bw - 16, bh);
    ctx.globalAlpha = aA;
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(bx1 + 8, by, bw - 16, bh);
    // arrow from chip
    ctx.beginPath();
    ctx.moveTo(W / 2 - 60, 330);
    ctx.quadraticCurveTo(bx1 + bw / 2, 360, bx1 + bw / 2, by - 14);
    ctx.stroke();
    ctx.restore();
    tag(ctx, "SUNDAY OCT 11", bx1 + bw / 2, by + bh + 44, INK, "center", aA, 20);
    tag(ctx, "→ THE WEEK BEFORE", bx1 + bw / 2, by - 30, s.accent, "center", aA, 22);
  }

  // moment B: Monday Oct 12 -> lights week 2
  const aB = ph(lt, 2.3, 2.7);
  if (aB > 0) {
    const wi = 1;
    ctx.save();
    ctx.fillStyle = s.accent;
    ctx.globalAlpha = aB * 0.16;
    ctx.fillRect(bx1 + wi * bw + 8, by, bw - 16, bh);
    ctx.globalAlpha = aB;
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(bx1 + wi * bw + 8, by, bw - 16, bh);
    ctx.beginPath();
    ctx.moveTo(W / 2 - 60, 330);
    ctx.quadraticCurveTo(bx1 + wi * bw + bw / 2, 360, bx1 + wi * bw + bw / 2, by - 14);
    ctx.stroke();
    ctx.restore();
    tag(ctx, "MONDAY OCT 12", bx1 + wi * bw + bw / 2, by + bh + 44, INK, "center", aB, 20);
    tag(ctx, "→ THE WEEK JUST ENDED", bx1 + wi * bw + bw / 2, by - 30, s.accent, "center", aB, 22);
    // the flip note
    ctx.save();
    ctx.globalAlpha = aB;
    ctx.font = MONO(24);
    ctx.fillStyle = DIM;
    const nt = "one day later - a new answer";
    const nw = widthTracked(ctx, nt, 2);
    trackText(ctx, nt, W / 2 - nw / 2, 780, 2);
    ctx.restore();
  }
  void stripA;
}

// ---------------------------------------------------------------------------
// 06 SEQUENCE
function sequence(ctx: Ctx, lt: number, frame: number) {
  const s = SCENES[6];
  header(ctx, s, lt);
  caption(ctx, s, lt);

  const jx = shake(lt, 1.15);
  const jy = shake(lt, 1.15, 47, 3);

  // page lines (the document behind)
  const up = ph(lt, 1.7, 2.2, ease.o);
  if (up > 0) {
    ctx.save();
    ctx.globalAlpha = up;
    for (let i = 0; i < 9; i++) {
      const y = 270 + i * 64;
      ctx.strokeStyle = "rgba(237,234,227,0.10)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(360, y); ctx.lineTo(1560, y); ctx.stroke();
    }
    ctx.restore();
  }

  // card A: line 12
  const aA = ph(lt, 0.3, 0.7, ease.o);
  ctx.save();
  ctx.translate(lerp(-260, 0, aA) + jx, jy * 0.4);
  card(ctx, 420, 380, 480, 150, s.accent, 1);
  ctx.font = MONO(32);
  ctx.fillStyle = INK;
  ctx.globalAlpha = 1;
  ctx.fillText("Next: refresh keys", 462, 445);
  ctx.font = MONO(22);
  ctx.fillStyle = DIM;
  ctx.fillText("OCT 14", 462, 486);
  ctx.restore();

  // card B: line 40
  const aB = ph(lt, 0.55, 0.95, ease.o);
  ctx.save();
  ctx.translate(lerp(260, 0, aB) + jx, -jy * 0.6);
  card(ctx, 1020, 380, 480, 150, s.accent, 1);
  ctx.font = MONO(32);
  ctx.fillStyle = INK;
  ctx.globalAlpha = 1;
  ctx.fillText("Next: rotate tokens", 1062, 445);
  ctx.font = MONO(22);
  ctx.fillStyle = DIM;
  ctx.fillText("OCT 14", 1062, 486);
  ctx.restore();

  // TIE badge above the cards
  const ut = ph(lt, 1.15, 1.45, ease.oBack);
  if (ut > 0) {
    ctx.save();
    ctx.globalAlpha = ut * (0.75 + 0.25 * Math.sin(lt * 9));
    ctx.font = MONO(26);
    ctx.fillStyle = s.accent;
    const tb = "SAME DAY";
    const tw = widthTracked(ctx, tb, 3);
    chipBox(ctx, W / 2 - tw / 2 - 20, 296, tw + 40, 52, s.accent, undefined, 26);
    trackText(ctx, tb, W / 2 - tw / 2, 330, 3);
    ctx.restore();
  }

  // line markers
  const ul = ph(lt, 1.9, 2.3);
  if (ul > 0) {
    tag(ctx, "LINE 12", 660, 580, DIM, "center", ul, 22);
    tag(ctx, "LINE 40", 1260, 580, DIM, "center", ul, 22);
  }

  // verdict
  const uv = ph(lt, 2.4, 2.9, ease.o);
  if (uv > 0) {
    // B wins: lift + glow
    ctx.save();
    ctx.globalAlpha = uv;
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(1020 - 6 * uv, 380 - 6 * uv, 480 + 12 * uv, 150 + 12 * uv);
    ctx.restore();
    tag(ctx, "WRITTEN LATER - CURRENT", 1260, 342, s.accent, "center", uv, 23);
    // A superseded
    strike(ctx, 462, 436, 462 + 340, "rgba(237,234,227,0.6)", ph(lt, 2.6, 2.95));
    tag(ctx, "SUPERSEDED", 660, 342, DIM, "center", ph(lt, 2.9, 3.2), 22);
  }
}

// ---------------------------------------------------------------------------
// 07 VERIFICATION
function verification(ctx: Ctx, lt: number, frame: number) {
  const s = SCENES[7];
  header(ctx, s, lt);
  caption(ctx, s, lt);

  // left column: the fact card + its two seals
  const a = ph(lt, 0.25, 0.6, ease.o);
  ctx.save();
  ctx.translate(lerp(-60, 0, a), 0);
  card(ctx, 330, 300, 600, 130, s.accent, 1);
  ctx.font = MONO(36);
  ctx.fillStyle = INK;
  ctx.fillText("importer beta - OCT 3", 372, 378);
  ctx.restore();

  // seal 1: author, at ingest
  stamp(ctx, "SEALED BY AUTHOR - OCT 3", 630, 495, 26, s.accent, lt, 0.8);
  // seal 2: the re-check caught the drift
  stamp(ctx, "RE-CHECKED OCT 22 - CHANGED", 630, 590, 26, s.accent, lt, 3.0);

  // right column: the source document
  const us = ph(lt, 1.6, 2.0, ease.o);
  if (us > 0) {
    ctx.save();
    ctx.globalAlpha = us;
    ctx.translate(lerp(80, 0, us), 0);
    card(ctx, 1120, 280, 480, 240, "rgba(237,234,227,0.5)", 1);
    ctx.font = MONO(21);
    ctx.fillStyle = DIM;
    ctx.fillText("the source file, re-read OCT 22", 1156, 328);
    ctx.font = MONO(30);
    ctx.fillStyle = "rgba(237,234,227,0.6)";
    ctx.fillText("beta: OCT 3", 1156, 420);
    ctx.restore();
  }

  // connector: the fact is held against its source
  const uc = ph(lt, 1.85, 2.15);
  if (uc > 0) {
    ctx.save();
    ctx.globalAlpha = uc;
    ctx.strokeStyle = "rgba(237,234,227,0.4)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(936, 365); ctx.lineTo(lerp(940, 1114, uc), 400); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // scan sweep across the source card
  const sc = ph(lt, 2.2, 2.6, (t) => t);
  if (sc > 0 && sc < 1) {
    ctx.save();
    const x = lerp(1120, 1600, sc);
    const g = ctx.createLinearGradient(x - 46, 0, x + 8, 0);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, s.accent);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = g;
    ctx.fillRect(x - 46, 286, 54, 228);
    ctx.restore();
  }

  // the diff: the source says something else now
  const diff = ph(lt, 2.55, 2.85);
  if (diff > 0) {
    ctx.save();
    ctx.globalAlpha = diff;
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 2.5;
    strike(ctx, 1154, 412, 1352, s.accent, ph(lt, 2.55, 2.75));
    ctx.font = MONO(30);
    ctx.fillStyle = s.accent;
    ctx.fillText("beta: OCT 8", 1156, 476);
    ctx.restore();
    tag(ctx, "THE SOURCE DRIFTED", 1360, 560, s.accent, "center", diff, 21);
  }
  void a;
}

// ---------------------------------------------------------------------------
// 08 ACCESS
function access(ctx: Ctx, lt: number, frame: number) {
  const s = SCENES[8];
  header(ctx, s, lt);
  caption(ctx, s, lt);

  // budget chip
  const ub = ph(lt, 0.9, 1.25, ease.oBack);
  if (ub > 0) {
    ctx.save();
    ctx.globalAlpha = ub;
    ctx.font = MONO(26);
    ctx.fillStyle = s.accent;
    const t = "budget: re-check 1";
    const w = widthTracked(ctx, t, 2);
    chipBox(ctx, W / 2 - w / 2 - 22, 218, w + 44, 54, s.accent, undefined, 27);
    trackText(ctx, t, W / 2 - w / 2, 254, 2);
    ctx.restore();
  }

  // two stale facts
  const drawFact = (y: number, title: string, sub: string, tagS: string, a: number, dust: number) => {
    ctx.save();
    ctx.globalAlpha = a;
    card(ctx, 610, y, 700, 140, s.accent, 1 - 0.35 * dust);
    ctx.font = MONO(34);
    ctx.fillStyle = INK;
    ctx.fillText(title, 660, y + 60);
    ctx.font = MONO(24);
    ctx.fillStyle = DIM;
    ctx.fillText(sub, 660, y + 102);
    ctx.restore();
    if (tagS) tag(ctx, tagS, 1360, y + 78, dust > 0.5 ? DIM : s.accent, "left", a, 23);
  };

  const mA = ph(lt, 1.6, 2.25, ease.io); // A jumps the queue
  const aAy = lerp(400, 300, ease.o(mA));
  drawFact(aAy, "status: on track", "STALE", "last read 2 DAYS AGO", ph(lt, 0.3, 0.65, ease.o), 0);
  drawFact(560, "decision: delay the beta", "STALE", "not read in 60 DAYS", ph(lt, 0.5, 0.85, ease.o), 1);

  // the jump: A glides up + accent frame
  if (mA > 0) {
    ctx.save();
    ctx.globalAlpha = mA;
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(610 - 6 * mA, aAy - 6 * mA, 700 + 12 * mA, 140 + 12 * mA);
    ctx.restore();
    tag(ctx, "CHECKED FIRST", 960, aAy + 176, s.accent, "center", mA, 23);
  }
  // B waits
  const uw = ph(lt, 2.6, 3.0);
  if (uw > 0) {
    tag(ctx, "STILL WAITING", 960, 730, DIM, "center", uw, 22);
  }
}

// ---------------------------------------------------------------------------
// 09 VOLATILITY
function volatility(ctx: Ctx, lt: number, frame: number) {
  const s = SCENES[9];
  header(ctx, s, lt);
  caption(ctx, s, lt);

  // day scrubber
  const day = Math.round(lerp(0, 120, ph(lt, 0.7, 3.3, (t) => t)));
  ctx.save();
  ctx.font = MONO(30);
  ctx.fillStyle = INK;
  const dt = `DAY ${day}`;
  const dw = widthTracked(ctx, dt, 3);
  trackText(ctx, dt, W / 2 - dw / 2, 262, 3);
  ctx.restore();

  const cols = [
    { name: "STATUS", life: 7, tagS: "needs a check" },
    { name: "DECISION", life: 90, tagS: "past its shelf life" },
    { name: "IDENTITY", life: Infinity, tagS: "never goes stale" },
  ];
  const cw = 380, gap = 90;
  const x0 = W / 2 - (3 * cw + 2 * gap) / 2;
  cols.forEach((c, i) => {
    const a = ph(lt, 0.25 + i * 0.12, 0.6 + i * 0.12, ease.o);
    if (a <= 0) return;
    const x = x0 + i * (cw + gap);
    const y = 360;
    card(ctx, x, y, cw, 300, s.accent, a);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = MONO(30);
    ctx.fillStyle = INK;
    trackText(ctx, c.name, x + 34, y + 56, 4);
    // shelf life label
    ctx.font = MONO(22);
    ctx.fillStyle = DIM;
    trackText(ctx, c.life === Infinity ? "shelf life: NONE" : `shelf life: ${c.life} DAYS`, x + 34, y + 94, 2);
    // freshness bar: depletes with days
    const frac = c.life === Infinity ? 1 : clamp(1 - day / c.life);
    const bw = cw - 68;
    ctx.strokeStyle = "rgba(237,234,227,0.25)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 34, y + 140, bw, 18);
    ctx.fillStyle = frac <= 0 ? "rgba(237,234,227,0.25)" : s.accent;
    ctx.fillRect(x + 34, y + 140, Math.max(0, bw * frac), 18);
    // status word
    ctx.font = MONO(24);
    ctx.fillStyle = frac <= 0 ? "rgba(237,234,227,0.4)" : s.accent;
    trackText(ctx, frac <= 0 ? c.tagS.toUpperCase() : "FRESH", x + 34, y + 220, 3);
    ctx.restore();
  });
}

// ---------------------------------------------------------------------------
// 10 INTENDED
function intended(ctx: Ctx, lt: number, frame: number) {
  const s = SCENES[10];
  header(ctx, s, lt);
  caption(ctx, s, lt);

  // quote types
  ctx.save();
  ctx.font = MONO(31);
  const q = "“remind me next week to check the importer”";
  const uq = ph(lt, 0.35, 1.15, (t) => t);
  const qw = widthTracked(ctx, q, 2);
  ctx.globalAlpha = ph(lt, 0.3, 0.5);
  ctx.strokeStyle = "rgba(237,234,227,0.25)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(W / 2 - qw / 2 - 26, 218, qw + 52, 62, 31); ctx.stroke();
  ctx.fillStyle = INK;
  typeText(ctx, q, W / 2 - qw / 2, 256, uq, 2);
  ctx.restore();

  // axis with NOW + next-week block
  const ax1 = 300, ax2 = 1620, ay = 640;
  const nowX = 560;
  const wk1 = 1000, wk2 = 1400;
  const ua = ph(lt, 0.5, 1.0, ease.o);
  ctx.save();
  axis(ctx, lerp(W / 2, ax1, ua), lerp(W / 2, ax2, ua), ay, null, 0);
  ctx.restore();

  // now head
  const un = ph(lt, 1.05, 1.45, ease.oBack);
  if (un > 0) {
    head(ctx, nowX, ay - 150, ay + 90, INK, un);
    tag(ctx, "NOW - THU OCT 8", nowX, ay + 130, DIM, "center", un, 22);
  }

  // next week block
  const uw = ph(lt, 1.2, 1.7);
  if (uw > 0) {
    ctx.save();
    ctx.globalAlpha = 0.10 * uw;
    ctx.fillStyle = s.accent;
    ctx.fillRect(wk1, ay - 90, wk2 - wk1, 180);
    ctx.globalAlpha = uw;
    ctx.strokeStyle = s.accent;
    ctx.setLineDash([6, 7]);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(wk1, ay - 90, wk2 - wk1, 180);
    ctx.setLineDash([]);
    ctx.restore();
    tag(ctx, "NEXT WEEK", (wk1 + wk2) / 2, ay + 130, s.accent, "center", uw, 22);
    tag(ctx, "MON 12 - SUN 18", (wk1 + wk2) / 2, ay - 116, DIM, "center", uw, 20);
  }

  // the arc leap from now into the block
  const ul = ph(lt, 1.9, 2.7, ease.io);
  if (ul > 0) {
    const x0 = nowX, y0 = ay - 20;
    const x1 = (wk1 + wk2) / 2, y1 = ay - 26;
    const cxp = (x0 + x1) / 2, cyp = ay - 430;
    const px = qbez(x0, cxp, x1, ul);
    const py = qbez(y0, cyp, y1, ul);
    // arc trail
    ctx.save();
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const u = (i / 40) * ul;
      const yy = qbez(y0, cyp, y1, u);
      const xx = qbez(x0, cxp, x1, u);
      if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    ctx.restore();
    glowDot(ctx, px, py, 9, s.accent, ul < 1 ? 1 : ph(lt, 2.7, 3.0) * 0 + 1 - ph(lt, 2.75, 3.05));
    // landing chip
    const land = ph(lt, 2.7, 3.05, ease.oBack);
    if (land > 0) {
      ctx.save();
      ctx.globalAlpha = land;
      ctx.font = MONO(26);
      ctx.fillStyle = INK;
      const t = "check the importer";
      const w = widthTracked(ctx, t, 2);
      chipBox(ctx, (wk1 + wk2) / 2 - w / 2 - 20, ay - 46 - 40 * (1 - land), w + 40, 52, s.accent, undefined, 26);
      trackText(ctx, t, (wk1 + wk2) / 2 - w / 2, ay - 13 - 40 * (1 - land), 2);
      ctx.restore();
    }
  }

  // "right of now" tint
  const ut = ph(lt, 3.1, 3.7);
  if (ut > 0) {
    ctx.save();
    const g = ctx.createLinearGradient(nowX, 0, W, 0);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, s.accent);
    ctx.globalAlpha = 0.06 * ut;
    ctx.fillStyle = g;
    ctx.fillRect(nowX, 160, W - nowX, 720);
    ctx.restore();
    tag(ctx, "THE ONLY KIND THAT LIVES RIGHT OF NOW", 1210, 852, s.accent, "center", ut, 20);
  }
}
const qbez = (a: number, c: number, b: number, t: number) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;

// ---------------------------------------------------------------------------
// 11 BUSINESS
function business(ctx: Ctx, lt: number, frame: number) {
  const s = SCENES[11];
  header(ctx, s, lt);
  caption(ctx, s, lt);

  const cx = 960, cy = 590, R = 300;
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  // ring rotates JUL to top over 0.4-1.2
  const rot = lerp(-Math.PI / 2, -Math.PI / 2 + Math.PI, ph(lt, 0.45, 1.25, ease.io)); // JAN top -> JUL top
  const ua = ph(lt, 0.2, 0.7, ease.oBack);
  const rr = R * ua;

  // quarter arcs (after rotation): Q1 JUL-SEP (months 6,7,8) etc
  const uq = ph(lt, 1.5, 2.3, ease.o);
  if (uq > 0) {
    for (let q = 0; q < 4; q++) {
      const m0 = 6 + q * 3;
      const a0 = rot + (m0 * (Math.PI * 2)) / 12 - 0.028;
      const a1 = rot + ((m0 + 3) * (Math.PI * 2)) / 12 + 0.028;
      ctx.save();
      ctx.globalAlpha = uq;
      ctx.strokeStyle = s.accent;
      ctx.lineWidth = q % 2 === 0 ? 7 : 3;
      ctx.beginPath();
      ctx.arc(cx, cy, rr + 26, a0, a1);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ring + ticks + labels
  ctx.save();
  ctx.strokeStyle = "rgba(237,234,227,0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
  ctx.font = MONO(22);
  for (let m = 0; m < 12; m++) {
    const a = rot + (m * (Math.PI * 2)) / 12;
    const x1 = cx + Math.cos(a) * rr, y1 = cy + Math.sin(a) * rr;
    const x2 = cx + Math.cos(a) * (rr + 14), y2 = cy + Math.sin(a) * (rr + 14);
    ctx.strokeStyle = m % 3 === 0 ? "rgba(237,234,227,0.6)" : "rgba(237,234,227,0.3)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const lx = cx + Math.cos(a) * (rr + 46), ly = cy + Math.sin(a) * (rr + 46);
    ctx.fillStyle = DIM;
    trackText(ctx, months[m], lx, ly + 7, 1, "center");
  }
  ctx.restore();

  // center: FY26
  const uf = ph(lt, 2.4, 2.9, ease.o);
  if (uf > 0) {
    ctx.save();
    ctx.globalAlpha = uf;
    ctx.fillStyle = INK;
    ctx.font = DISP(92);
    ctx.textAlign = "center";
    ctx.fillText("FY26", cx, cy - 4);
    ctx.font = MONO(24);
    ctx.fillStyle = DIM;
    ctx.fillText("JUL 2025 - JUN 2026", cx, cy + 52);
    ctx.textAlign = "left";
    ctx.restore();
    // Q labels on arcs, outside the month labels
    for (let q = 0; q < 4; q++) {
      const m0 = 6 + q * 3;
      const a = rot + ((m0 + 1.5) * (Math.PI * 2)) / 12;
      const lx = cx + Math.cos(a) * (rr + 84), ly = cy + Math.sin(a) * (rr + 84);
      tag(ctx, `Q${q + 1}`, lx, ly + 6, s.accent, "center", uf, 20);
    }
  }
}

// ---------------------------------------------------------------------------
// 12 ASOF
function asof(ctx: Ctx, lt: number, frame: number) {
  const s = SCENES[12];
  header(ctx, s, lt);
  caption(ctx, s, lt);

  // ambient accent tint while pinned to a date
  const tint = ph(lt, 1.0, 1.5) * (1 - ph(lt, 3.0, 3.5));
  if (tint > 0) {
    ctx.save();
    ctx.globalAlpha = 0.07 * tint;
    ctx.fillStyle = s.accent;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // Q1 types
  ctx.save();
  ctx.font = MONO(30);
  const q1 = "As of Oct 14, what was the plan?";
  const u1 = ph(lt, 0.35, 1.0, (t) => t);
  const w1 = widthTracked(ctx, q1, 2);
  ctx.globalAlpha = ph(lt, 0.3, 0.5);
  ctx.strokeStyle = "rgba(237,234,227,0.25)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(W / 2 - w1 / 2 - 24, 200, w1 + 48, 58, 29); ctx.stroke();
  ctx.fillStyle = INK;
  typeText(ctx, q1, W / 2 - w1 / 2, 238, u1, 2);
  ctx.restore();

  // the dial: date spins then settles on OCT 14; "now" clears it
  const u3 = ph(lt, 3.15, 3.6, ease.o);
  const spin = ["SEPT 30", "OCT 7", "OCT 10", "OCT 14"];
  const settleAt = 1.35;
  const uspin = ph(lt, 0.7, settleAt, (t) => t);
  const idx = Math.min(spin.length - 1, Math.floor(uspin * spin.length));
  const shown = lt < settleAt ? spin[idx] : "OCT 14";
  const pop = ph(lt, settleAt, settleAt + 0.25, ease.oBack);
  if (u3 < 1) {
    ctx.save();
    ctx.translate(W / 2, 470);
    ctx.scale(lerp(1.06, 1, pop), lerp(1.06, 1, pop));
    ctx.globalAlpha = ph(lt, 0.7, 0.9);
    ctx.fillStyle = INK;
    ctx.font = DISP(150);
    ctx.textAlign = "center";
    if (pop > 0.9) { ctx.shadowColor = s.accent; ctx.shadowBlur = 30; }
    ctx.fillText(shown, 0, 0);
    ctx.textAlign = "left";
    ctx.restore();
  }
  tag(ctx, "AS OF", W / 2, 340, s.accent, "center", ph(lt, 0.7, 1.0) * (1 - u3), 26);

  // Q2 inherits
  const u2 = ph(lt, 1.9, 2.5);
  if (u2 > 0) {
    ctx.save();
    ctx.globalAlpha = u2 * (1 - u3);
    ctx.font = MONO(28);
    ctx.fillStyle = INK;
    const q2 = "“and for beta?”";
    const w2 = widthTracked(ctx, q2, 2);
    const qx = W / 2 - w2 / 2 - 420;
    chipBox(ctx, qx - 24, 610, w2 + 48, 56, "rgba(237,234,227,0.3)", undefined, 28);
    ctx.fillText(q2, qx, 647);
    // link to dial
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(qx + w2 + 30, 638); ctx.lineTo(W / 2 - 300, 520); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    tag(ctx, "INHERITS - OCT 14", W / 2 - 290, 556, s.accent, "left", u2 * (1 - u3), 21);
  }

  // "now" clears
  const u3t = ph(lt, 2.9, 3.15, (t) => t);
  if (u3t > 0) {
    ctx.save();
    ctx.font = MONO(30);
    ctx.fillStyle = s.accent;
    const w3 = widthTracked(ctx, "now", 2) * u3t;
    ctx.save();
    ctx.beginPath();
    ctx.rect(W / 2 + 250, 596, w3 + 10, 60);
    ctx.clip();
    ctx.fillText("now", W / 2 + 250, 640);
    ctx.restore();
    ctx.strokeStyle = s.accent;
    ctx.strokeRect(W / 2 + 238, 602, 108, 50);
    ctx.restore();
  }
  if (u3 > 0) {
    // date lifts away, LIVE settles in
    ctx.save();
    ctx.globalAlpha = 1 - u3;
    ctx.translate(0, -60 * u3);
    ctx.font = DISP(150);
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.fillText("OCT 14", W / 2, 470);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = u3;
    ctx.fillStyle = s.accent;
    ctx.font = DISP(150);
    ctx.textAlign = "center";
    ctx.shadowColor = s.accent;
    ctx.shadowBlur = 34;
    ctx.fillText("LIVE", W / 2, 470 + 30 * (1 - u3));
    ctx.textAlign = "left";
    ctx.restore();
    tag(ctx, "THE AMBIENT NOW, CLEARED", W / 2, 730, DIM, "center", ph(lt, 3.5, 3.9), 22);
  }
}

// ---------------------------------------------------------------------------
// OUTRO
function outro(ctx: Ctx, lt: number, frame: number) {
  // grid of 12
  const cols = 4, rows = 3;
  const cw = 330, ch = 150, gapx = 30, gapy = 30;
  const gx = W / 2 - (cols * cw + (cols - 1) * gapx) / 2;
  const gy = 250;
  SCENES.slice(1, 13).forEach((k, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    // stagger from center of grid outward
    const d = Math.abs(col - 1.5) + Math.abs(row - 1);
    const a = ph(lt, 0.15 + d * 0.12, 0.5 + d * 0.12, ease.oBack);
    if (a <= 0) return;
    const x = gx + col * (cw + gapx);
    const y = gy + row * (ch + gapy);
    ctx.save();
    ctx.globalAlpha = Math.min(1, a);
    ctx.translate(0, lerp(26, 0, a));
    ctx.strokeStyle = "rgba(237,234,227,0.22)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(x, y, cw, ch, 10); ctx.stroke();
    ctx.font = MONO(30);
    ctx.fillStyle = k.accent;
    trackText(ctx, k.num, x + 26, y + 56, 3);
    ctx.font = MONO(26);
    ctx.fillStyle = INK;
    ctx.globalAlpha = Math.min(1, a) * 0.9;
    trackText(ctx, k.name, x + 26, y + 104, 4);
    ctx.restore();
  });

  // bookend line
  const a2 = ph(lt, 1.35, 1.95, ease.o);
  if (a2 > 0) {
    ctx.save();
    ctx.globalAlpha = a2;
    ctx.fillStyle = INK;
    ctx.font = DISP(66);
    ctx.textAlign = "center";
    ctx.fillText("One question. Twelve answers.", W / 2, 860);
    ctx.textAlign = "left";
    ctx.restore();
  }
  const a3 = ph(lt, 2.3, 2.8);
  if (a3 > 0) {
    tag(ctx, "each one proven, not named - test/kinds", W / 2, 930, DIM, "center", a3, 23);
    tag(ctx, "dozentimes", W / 2, 986, "rgba(237,234,227,0.4)", "center", a3, 22);
  }
}

// ---------------------------------------------------------------------------
// transition wipe: the reading head sweeps the frame at every cut
function transitionWipe(ctx: Ctx, t: number) {
  const { scene, next } = sceneAt(t);
  if (!next) return;
  const dt = t - scene.start - scene.dur; // time to boundary
  if (dt < -0.20 || dt > 0.22) return;
  const u = (dt + 0.20) / 0.42; // 0..1 across the boundary
  const x = lerp(-80, W + 80, ease.io(u));
  ctx.save();
  const g = ctx.createLinearGradient(x - 150, 0, x + 30, 0);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, next.accent === INK ? "rgba(237,234,227,0.75)" : next.accent);
  ctx.fillStyle = g;
  ctx.fillRect(x - 150, 0, 150, H);
  ctx.fillStyle = next.accent === INK ? "rgba(244,242,236,0.95)" : next.accent;
  ctx.fillRect(x - 3, 0, 4, H);
  ctx.restore();
}

// ---------------------------------------------------------------------------

export function paintFrame(ctx: Ctx, t: number, frame: number) {
  const { scene, lt } = sceneAt(t);
  base(ctx, t);
  switch (scene.id) {
    case "hook": hook(ctx, lt, frame); break;
    case "event": event(ctx, lt, frame); break;
    case "valid": valid(ctx, lt, frame); break;
    case "record": record(ctx, lt, frame); break;
    case "source": source(ctx, lt, frame); break;
    case "reference": reference(ctx, lt, frame); break;
    case "sequence": sequence(ctx, lt, frame); break;
    case "verification": verification(ctx, lt, frame); break;
    case "access": access(ctx, lt, frame); break;
    case "volatility": volatility(ctx, lt, frame); break;
    case "intended": intended(ctx, lt, frame); break;
    case "business": business(ctx, lt, frame); break;
    case "asof": asof(ctx, lt, frame); break;
    case "outro": outro(ctx, lt, frame); break;
  }
  transitionWipe(ctx, t);
  vign(ctx);
  grain(ctx, frame);
}

function base(ctx: Ctx, t: number) {
  ctx.fillStyle = "#0A0B0D";
  ctx.fillRect(0, 0, W, H);
}

// tiny helper re-export for stills
export { SCENES };
