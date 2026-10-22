// Single source of truth for the whole video: scene times, copy, accents.
// The renderer, the music, and the share page all read this one table.

export const FPS = 30;
export const W = 1920;
export const H = 1080;
export const DUR = 60.0;

export type Scene = {
  id: string;        // "event", "valid", ...
  num: string;       // "01"
  name: string;      // "EVENT"
  question: string;  // the form of "when" this kind answers
  kicker: string;    // top-left mono label
  caption: string;   // the proof line, mono, bottom
  start: number;     // seconds
  dur: number;
  accent: string;    // hex
};

export const BG = "#0A0B0D";
export const INK = "#EDEAE3";
export const DIM = "rgba(237,234,227,0.55)";
export const FAINT = "rgba(237,234,227,0.22)";
export const HAIR = "rgba(237,234,227,0.14)";

// hues advance ~28 deg per kind, same S/L -> one family, a journey
const ACCENTS = [
  "#E3A857", // event   amber
  "#C9C05A", // valid   citron
  "#9FBE62", // record  olive
  "#7CBB7A", // source  green
  "#63B992", // reference teal
  "#5CB5A9", // sequence mint
  "#59AEBD", // verification cyan
  "#5FA3CE", // access  sky
  "#7194DB", // volatility periwinkle
  "#8F82E0", // intended violet
  "#B273DE", // business orchid
  "#D670C4", // asof    orchid-pink
];

export const HOOK: Scene = {
  id: "hook", num: "00", name: "HOOK",
  question: "", kicker: "", caption: "",
  start: 0, dur: 5.5, accent: INK,
};

const KINDS: Array<[string, string, string, string, string]> = [
  // name, question, kicker, caption
  ["EVENT", "When did it happen?",
    "01 / EVENT TIME", "Asked about September, only September answers."],
  ["VALID", "When was it true?",
    "02 / VALID TIME", "Same file. The answer changed. Both were right."],
  ["RECORD", "When did we learn it?",
    "03 / RECORD TIME", "It happened Sept 12. We only knew Oct 1."],
  ["SOURCE", "When was the file last touched?",
    "04 / SOURCE TIME", "Copying a file doesn't rewrite its history."],
  ["REFERENCE", "What does \"last week\" point at?",
    "05 / REFERENCE TIME", "Same words. Different week. The now decides."],
  ["SEQUENCE", "When the day ties, what breaks it?",
    "06 / SEQUENCE TIME", "Same day, two lines. The one written later wins."],
  ["VERIFICATION", "Who vouched, and when?",
    "07 / VERIFICATION TIME", "A fact is only as fresh as its last check."],
  ["ACCESS", "When did we last look?",
    "08 / ACCESS TIME", "Recently read gets re-checked first."],
  ["VOLATILITY", "How long until it goes stale?",
    "09 / VOLATILITY TIME", "Statuses fade in days. Names never fade."],
  ["INTENDED", "When should it become true?",
    "10 / INTENDED TIME", "The only time that lives ahead of you."],
  ["BUSINESS", "Which calendar is it?",
    "11 / BUSINESS TIME", "Your year starts January. The fiscal year starts July 1."],
  ["ASOF", "Which now are we reading in?",
    "12 / AS-OF TIME", "Say a date and every question inherits it. Say \"now\" and it clears."],
];

const kindDur = 4.2;
export const KIND_START = HOOK.start + HOOK.dur; // 5.5

export const SCENES: Scene[] = [
  HOOK,
  ...KINDS.map(([name, question, kicker, caption], i) => ({
    id: name.toLowerCase().replace(/[^a-z]/g, ""),
    num: String(i + 1).padStart(2, "0"),
    name, question, kicker, caption,
    start: KIND_START + i * kindDur,
    dur: kindDur,
    accent: ACCENTS[i],
  })),
  {
    id: "outro", num: "13", name: "OUTRO",
    question: "", kicker: "", caption: "",
    start: KIND_START + 12 * kindDur, dur: DUR - (KIND_START + 12 * kindDur), // 4.1s
    accent: INK,
  },
];

export function sceneAt(t: number): { scene: Scene; next: Scene | null; lt: number; progress: number } {
  for (let i = SCENES.length - 1; i >= 0; i--) {
    const s = SCENES[i];
    if (t >= s.start) {
      const next = SCENES[i + 1] ?? null;
      return { scene: s, next, lt: t - s.start, progress: next ? Math.min(1, (t - s.start) / (next.start - s.start)) : 1 };
    }
  }
  return { scene: SCENES[0], next: SCENES[1] ?? null, lt: 0, progress: 0 };
}

// ---------- easing + math helpers ----------

export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = {
  io: (t: number) => t * t * (3 - 2 * t),
  o: (t: number) => 1 - Math.pow(1 - t, 3),
  i: (t: number) => t * t * t,
  oBack: (t: number) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  oQuint: (t: number) => 1 - Math.pow(1 - t, 5),
};
// normalized time in [0,1] over a window, eased
export function phase(lt: number, from: number, to: number, fn: (t: number) => number = ease.io) {
  if (to <= from) return lt >= to ? 1 : 0;
  return fn(clamp((lt - from) / (to - from)));
}
// stagger helper for i-th of n items
export function stag(lt: number, from: number, each: number, i: number, span = 0.9, fn?: (t: number) => number) {
  return phase(lt, from + i * each, from + i * each + span, fn);
}
