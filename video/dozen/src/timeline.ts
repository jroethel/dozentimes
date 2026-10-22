// The single source of truth: timing, copy, palettes and sound cues.
// scenes.ts paints from it, music.ts scores from it, storyboard.md documents it.

export const FPS = 60;
export const DUR = 60;
export const BPM = 120; // one beat = 0.5 s, one kind = two bars = 4 s

export interface Pal { bg: string; bg2: string; ink: string; sub: string; acc: string; dark: boolean }

export const PAL = {
  hook:   { bg: "#09090c", bg2: "#15141a", ink: "#f3eee4", sub: "#8f8a80", acc: "#d6ff3d", dark: true },
  event:  { bg: "#060a1d", bg2: "#13204e", ink: "#f4efe6", sub: "#8d94b5", acc: "#ffc757", dark: true },
  valid:  { bg: "#ece6da", bg2: "#f6f2ea", ink: "#141416", sub: "#5c574e", acc: "#2b45ff", dark: false },
  record: { bg: "#040409", bg2: "#100e22", ink: "#f2eee6", sub: "#8c88a3", acc: "#ffd27a", dark: true },
  source: { bg: "#ef4a12", bg2: "#ff6a2b", ink: "#170a04", sub: "#5e1d05", acc: "#fff4e4", dark: false },
  ref:    { bg: "#1b2fd6", bg2: "#2e46f2", ink: "#f5f2ea", sub: "#b5c0ff", acc: "#ffe45c", dark: true },
  seq:    { bg: "#080b0b", bg2: "#11201d", ink: "#eef3ee", sub: "#7f8f8a", acc: "#3dffb0", dark: true },
  verify: { bg: "#e9eae4", bg2: "#f6f6f1", ink: "#121412", sub: "#5a5d55", acc: "#e0362a", dark: false },
  access: { bg: "#120a06", bg2: "#2a170c", ink: "#f6ede2", sub: "#a08b78", acc: "#ffa53d", dark: true },
  vol:    { bg: "#c6f02a", bg2: "#dcff4f", ink: "#0e1206", sub: "#3f5012", acc: "#0e1206", dark: false },
  intend: { bg: "#0f0824", bg2: "#241248", ink: "#f3eeff", sub: "#9d8fc4", acc: "#c29bff", dark: true },
  bus:    { bg: "#08201a", bg2: "#103428", ink: "#edf6ef", sub: "#86a596", acc: "#f2c14e", dark: true },
  asof:   { bg: "#07071a", bg2: "#121233", ink: "#f1f0ff", sub: "#8b8ab0", acc: "#ff5c8a", dark: true },
  outro:  { bg: "#09090c", bg2: "#16151b", ink: "#f3eee4", sub: "#8f8a80", acc: "#d6ff3d", dark: true },
} satisfies Record<string, Pal>;

export type PalKey = keyof typeof PAL;

export interface Kind {
  n: number;
  key: PalKey;
  name: string;
  q: string;
  start: number;
  // every string the viewer must read in this scene, for the reading budget
  copy: string[];
}

const k = (n: number) => 6 + 4 * (n - 1);

export const HOOK = { start: 0, end: 6 };
export const OUTRO = { start: 54, end: 60 };

export const KINDS: Kind[] = [
  { n: 1, key: "event", name: "Event time", q: "When did it happen?", start: k(1),
    copy: ["Apollo 11", "20:17 UTC", "July 20, 1969"] },
  { n: 2, key: "valid", name: "Valid time", q: "When was it true?", start: k(2),
    copy: ["Pluto is a planet", "1930", "2006", "Facts expire."] },
  { n: 3, key: "record", name: "Record time", q: "When did we find out?", start: k(3),
    copy: ["Happened", "Seen", "~166,000 BC", "~168,000 years", "1987"] },
  { n: 4, key: "source", name: "Source time", q: "When was it made?", start: k(4),
    copy: ["AUG 1 2019", "Downloaded today", "A copy isn't new."] },
  { n: 5, key: "ref", name: "Reference time", q: "Which day is “tomorrow”?", start: k(5),
    copy: ["See you tomorrow!", "Mar 3", "Written", "Read"] },
  { n: 6, key: "seq", name: "Sequence time", q: "Which came first?", start: k(6),
    copy: ["09:00:00", "A", "B", "Clocks tie. Order doesn't.", "Lamport, 1978"] },
  { n: 7, key: "verify", name: "Verification time", q: "Last checked when?", start: k(7),
    copy: ["Elevator inspection", "Passed Mar 2024", "Today", "True when checked. Unknown since."] },
  { n: 8, key: "access", name: "Access time", q: "Last looked at when?", start: k(8),
    copy: ["Last opened", "today", "last week", "2023", "Read most, check first."] },
  { n: 9, key: "vol", name: "Volatility", q: "Shelf life?", start: k(9),
    copy: ["Status", "7 days", "Decision", "90 days", "Name", "never", "Day 120", "Facts have half-lives."] },
  { n: 10, key: "intend", name: "Intended time", q: "When should it happen?", start: k(10),
    copy: ["Remind me next Tuesday", "Now", "It points forward."] },
  { n: 11, key: "bus", name: "Business time", q: "Which calendar?", start: k(11),
    copy: ["Jan 1", "Apr 6", "UK tax year", "A leftover from 1752."] },
  { n: 12, key: "asof", name: "As-of time", q: "From which “now”?", start: k(12),
    copy: ["How many planets?", "As of 2005", "As of today"] },
];

export const SHORT = ["Event", "Valid", "Record", "Source", "Reference", "Sequence",
  "Verification", "Access", "Volatility", "Intended", "Business", "As-of"];

export const HOOK_COPY = ["If I've told you once,", "I've told you a dozen times.", "Literally.", "Twelve kinds of time."];
export const OUTRO_COPY = ["There.", "Now I've told you a dozen times.", "freshtime"];

// Transitions: each one is motivated by the kinds on either side of it, and none repeats.
export interface Trans { name: string; from: number; to: number; a: number; b: number; blur: number }
export const TRANS: Trans[] = [
  { name: "dial dive",      from: 0,  to: 1,  a: 5.30,  b: 6.30,  blur: 10 },
  { name: "ripple iris",    from: 1,  to: 2,  a: 9.30,  b: 10.25, blur: 0 },
  { name: "line split",     from: 2,  to: 3,  a: 13.40, b: 14.30, blur: 12 },
  { name: "starlight flash", from: 3, to: 4,  a: 17.50, b: 18.40, blur: 0 },
  { name: "card flip",      from: 4,  to: 5,  a: 21.40, b: 22.30, blur: 10 },
  { name: "ink rain",       from: 5,  to: 6,  a: 25.30, b: 26.35, blur: 0 },
  { name: "stamp slam",     from: 6,  to: 7,  a: 29.45, b: 30.30, blur: 10 },
  { name: "ink bleed",      from: 7,  to: 8,  a: 33.35, b: 34.30, blur: 0 },
  { name: "spotlight iris", from: 8,  to: 9,  a: 37.40, b: 38.30, blur: 0 },
  { name: "drain",          from: 9,  to: 10, a: 41.35, b: 42.35, blur: 0 },
  { name: "curl",           from: 10, to: 11, a: 45.30, b: 46.35, blur: 8 },
  { name: "whip spin",      from: 11, to: 12, a: 49.45, b: 50.30, blur: 24 },
  { name: "pull back",      from: 12, to: 13, a: 53.40, b: 55.00, blur: 12 },
];

// Sound and picture cues, absolute seconds. scenes.ts and music.ts both read these.
export const CUE = {
  hook: { line1: 0.25, line2: 1.35, fan: 3.32, literally: 3.55, title: 4.4, dive: 5.3 },
  event: { touch: 6.5, roll: 6.7, lock: 7.55 },
  valid: { grow: 9.85, cut: 11.7, strike: 11.8, pay: 12.3 },
  record: { burst: 14.3, travel: 14.55, arrive: 15.95 },
  flash: 17.9,
  source: { copy: 19.05, pulse: 19.85, pay: 20.3 },
  flip: 21.85,
  ref: { written: 22.45, land1: 23.2, read: 23.75, land2: 24.3, cross: 24.5 },
  seq: { dropA: 26.45, dropB: 26.6, order: 27.45, pay: 28.25 },
  stamp: 30.0,
  verify: { pass: 30.95, passEnd: 32.25, pay: 32.35 },
  access: { rows: 34.2, sort: 34.95, heat: 35.75, pay: 36.25 },
  spot: { close: 37.8, open: 38.05 },
  vol: { count: 38.5, countEnd: 40.15, pay: 40.2 },
  intend: { type: 42.35, leap: 43.3, land: 43.95, pay: 44.3 },
  bus: { rotate: 46.85, lock: 47.85, pay: 48.35 },
  whip: 49.85,
  asof: { back: 50.65, backEnd: 51.45, fwd: 52.05, fwdEnd: 52.65, flip9: 51.16, flip8: 52.27 },
  outro: { sweep: 55.0, sweepEnd: 56.6, bell: 57.0, mark: 58.1, fade: 59.0 },
};

// The outro hand sweeps once round the dial; music strikes a bell as it reaches each hour.
export function sweepU(t: number) {
  const x = Math.max(0, Math.min(1, (t - CUE.outro.sweep) / (CUE.outro.sweepEnd - CUE.outro.sweep)));
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}
export function hourHit(h: number) {
  let lo = CUE.outro.sweep, hi = CUE.outro.sweepEnd;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (sweepU(mid) < h / 12) lo = mid; else hi = mid;
  }
  return hi;
}

// Reading budget: words a viewer must read per second of scene. Dates and numbers count as words.
export function readingBudget() {
  const words = (xs: string[]) => xs.join(" ").split(/\s+/).filter(Boolean).length;
  const rows = KINDS.map((kd) => {
    const n = words([kd.name, kd.q, ...kd.copy]);
    return { n: kd.n, name: kd.name, words: n, perSec: n / 4 };
  });
  rows.push({ n: 0, name: "Hook", words: words(HOOK_COPY), perSec: words(HOOK_COPY) / 6 });
  rows.push({ n: 13, name: "Outro", words: words([...OUTRO_COPY, ...SHORT]), perSec: words([...OUTRO_COPY, ...SHORT]) / 6 });
  return rows;
}

export const MAX_WORDS_PER_SEC = 4.0;

if (import.meta.main) {
  let bad = 0;
  for (const r of readingBudget()) {
    const flag = r.perSec > MAX_WORDS_PER_SEC ? "OVER" : "ok";
    if (flag === "OVER") bad++;
    console.log(`${String(r.n).padStart(2)} ${r.name.padEnd(18)} ${String(r.words).padStart(3)} words  ${r.perSec.toFixed(2)}/s  ${flag}`);
  }
  // transitions must be unique and ordered
  const names = new Set(TRANS.map((t) => t.name));
  if (names.size !== TRANS.length) { console.log("duplicate transition"); bad++; }
  for (let i = 1; i < TRANS.length; i++) if (TRANS[i].a < TRANS[i - 1].b) { console.log("overlap", TRANS[i].name); bad++; }
  process.exit(bad ? 1 : 0);
}
