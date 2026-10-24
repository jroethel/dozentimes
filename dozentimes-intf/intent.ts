// Question plus session state to a TemporalIntent. Deterministic chrono-node fallback, optional one-call Jev layer.
// Code does all date arithmetic. Jev only selects labels (mode, which candidate, keep-vs-replace).
import * as chrono from "chrono-node";
import type { DatabaseSync } from "node:sqlite";
import { addDays, isoDate, parseIso } from "../dozentimes-core/dates.ts";
import { askJev, jevEnabled } from "../dozentimes-core/jev.ts";
import type { JevAnswer, JevQuestion } from "../dozentimes-core/jev.ts";
import { trace } from "../dozentimes-core/trace.ts";
import type { Anchor, AsOfMode, Basis, Kind, Session, TemporalIntent } from "../dozentimes-core/contract.ts";

interface Cand { text: string; start: string; end: string }
type Result = { intent: TemporalIntent; session: Session };

const PREP = "as of|since|on|in|back in|during|from|between|by|before|after|for";
const NOW_CLEAR = /\b(now|currently|today)\b/i;
const NOW_WORD = /\b(now|currently|current|today|still|latest)\b/i;
const FUTURE = /\b(will|remind me|plan to|plan on|going to|upcoming)\b/i;
const SINCE = /\b(since|what changed)\b/i;

const monthRange = (y: number, m: number): [string, string] => [isoDate(new Date(y, m, 1, 12)), isoDate(new Date(y, m + 1, 0, 12))];

function candidates(question: string, nowIso: string): Cand[] {
  const now = parseIso(nowIso);
  const out: (Cand & { idx: number; plain: boolean })[] = [];
  for (const r of chrono.parse(question, { instant: now })) {
    if (/^(now|today|tonight|currently)$/i.test(r.text)) continue;
    const rel = /^(last|this|next)\s+(week|month)$/i.exec(r.text);
    let start = isoDate(r.start.date());
    let end = r.end ? isoDate(r.end.date()) : start;
    let plain = !rel;
    if (rel) {
      const k = { last: -1, this: 0, next: 1 }[rel[1].toLowerCase() as "last" | "this" | "next"];
      if (rel[2].toLowerCase() === "week") {
        const monday = addDays(nowIso, -((now.getDay() + 6) % 7) + 7 * k);
        [start, end] = [monday, addDays(monday, 6)];
      } else {
        [start, end] = monthRange(now.getFullYear(), now.getMonth() + k);
      }
    } else if (r.start.isCertain("month") && !r.start.isCertain("day")) {
      [start, end] = monthRange(r.start.date().getFullYear(), r.start.date().getMonth());
    }
    out.push({ text: r.text, start, end, idx: r.index, plain });
  }
  // "between X and Y" / "from X to Y": merge two plain points into one range spanning the original text.
  if (out.length >= 2 && out[0].plain && out[1].plain && /\b(between|from)\b/i.test(question.slice(0, out[0].idx + 1))) {
    const [a, b] = out;
    const text = question.slice(a.idx, b.idx + b.text.length);
    const dates = [a.start, a.end, b.start, b.end].sort();
    return [{ text, start: dates[0], end: dates[3] }, ...out.slice(2)];
  }
  return out.map(({ text, start, end }) => ({ text, start, end }));
}

function stripQuery(question: string, cand: Cand | null): string {
  let q = question;
  if (cand) {
    const esc = cand.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    q = q.replace(new RegExp(`(?:\\b(?:${PREP})\\s+(?:the\\s+)?)?${esc}`, "i"), " ");
  }
  q = q.replace(/\b(right now|now|currently|today)\b/gi, " ").replace(/\b(remind me)\b/gi, " ");
  return q.replace(/^[\s,;:]+/, "").replace(/\s+/g, " ").replace(/\s+([?.!,])/g, "$1").replace(/(\b(and|since|on|in|as of)\s*)?[\s?.!,]*$/i, "").trim();
}

function kindsFor(mode: AsOfMode, question: string): Kind[] {
  const k: Kind[] = {
    past: ["valid", "asof", "reference"], current: ["valid", "verification"], none: ["valid", "verification"],
    mixed: ["valid", "asof", "verification"], future: ["intended"], range: ["event", "valid"],
  }[mode] as Kind[];
  return /\b(fiscal|FY\d*)\b/i.test(question) ? [...k, "business"] : k;
}

interface Overrides { cand?: Cand | null; mode?: AsOfMode; nowQ?: boolean; replaceAmbient?: boolean; confidence?: number; path?: "jev" | "fallback" }

function derive(question: string, session: Session, cands: Cand[], ov: Overrides = {}): Result {
  const now = session.now;
  const jev = ov.path === "jev";
  const cand = ov.cand === undefined ? (cands[0] ?? null) : ov.cand;
  // With Jev, "is this about right now?" is Jev's judgment, not a keyword: "was that still true at the time?"
  // has "still" and is about the past. Without Jev, the keywords decide.
  const nowAny = jev ? !!ov.nowQ : NOW_WORD.test(question);
  const nowClear = jev ? !!ov.nowQ : NOW_CLEAR.test(question);
  const future = FUTURE.test(question);
  const anchored = (m?: AsOfMode) => !!m && ["past", "range", "mixed"].includes(m);
  let mode: AsOfMode;
  let basis: Basis = "default";
  let anchor: Anchor | null = null;
  if (cand) {
    basis = "stated";
    anchor = { start: cand.start, end: cand.end, text: cand.text };
    if (future || cand.start > now) mode = "future";
    else if (SINCE.test(question)) mode = "mixed";
    else mode = cand.start !== cand.end ? "range" : "past";
    if (ov.mode) mode = ov.mode;
  } else if (nowAny) mode = "current";
  else if (!jev && future) mode = "future"; // the rules read "will" as the future even mid-conversation
  else if (session.ambient && !ov.replaceAmbient) {
    // An inherited reading is kept unless Jev says the question changes the period. Jev's mode choice alone
    // reads "and the next step for alpha?" as future, because of the word "next".
    basis = "inherited";
    anchor = session.ambient;
    mode = anchor.start !== anchor.end ? "range" : "past";
  } else if (jev && ov.mode && !anchored(ov.mode)) {
    // Jev picked current, none or future, and its own "about right now?" judgment did not say now.
    mode = ov.mode;
  } else if (future) mode = "future";
  else if (jev && NOW_WORD.test(question)) mode = "current";
  else mode = "none"; // ponytail: a past with no date ("before the launch") has no anchor to read at, so it reads as now
  if (basis === "inherited" && !anchored(mode)) { basis = "default"; anchor = null; }

  let ambient = session.ambient;
  if (basis === "stated" && anchored(mode)) ambient = anchor;
  else if (basis !== "stated" && mode === "current" && (nowClear || ov.replaceAmbient)) ambient = null;
  else if (basis === "default" && ov.replaceAmbient) ambient = null;

  const intent: TemporalIntent = {
    asof_mode: mode, anchor, basis, kinds: kindsFor(mode, question),
    confidence: ov.confidence ?? 0.6, path: ov.path ?? "fallback", query: stripQuery(question, cand),
  };
  return { intent, session: { now, ambient } };
}

export const fallbackIntent = (question: string, session: Session): Result =>
  derive(question, session, candidates(question, session.now));

const ASOF_LABELS = {
  current: "Wants the state right now, today, or the latest",
  past: "Wants what was true at one specific past date",
  range: "Asks about a span of time such as a month, a week, or between two dates",
  future: "Asks about something planned, expected, or to be done later",
  mixed: "Wants a past point plus what changed since that point",
  none: "No time reference at all, a timeless question",
};

// The raw Jev request, without the rules or guards. Exported so tests can score Jev on its own.
export async function jevAnswers(question: string, session: Session, cands: Cand[] = candidates(question, session.now)): Promise<Record<string, JevAnswer>> {
  const state = [`Today is ${session.now}.`,
    session.ambient ? `Earlier in this conversation the time period under discussion was ${session.ambient.start}..${session.ambient.end}.` : "",
    `Question: ${question}`].filter(Boolean).join("\n");
  const qs: Record<string, JevQuestion> = {
    asof: { type: "choice", instructions: "Which kind of time reference does the question need?", criteria: ASOF_LABELS },
    now_q: { type: "noul", instructions: "Is the person asking about the current state right now?" },
  };
  if (cands.length) {
    const criteria: Record<string, string> = { none: "None of these phrases sets the time the answer should be about" };
    cands.forEach((c, i) => { criteria[`c${i + 1}`] = `The phrase "${c.text}"`; });
    qs.anchor = { type: "choice", instructions: "Which date phrase sets the time the answer should be about?", criteria };
  }
  if (session.ambient) qs.changes = { type: "noul", instructions: "Does this question change the time period under discussion?" };
  return (await askJev(state, qs)).answers;
}

async function jevLayer(question: string, session: Session, cands: Cand[]): Promise<Result> {
  const answers = await jevAnswers(question, session, cands);
  const ch = (a?: JevAnswer) => (a?.type === "choice" ? a : null);
  const yes = (a?: JevAnswer) => a?.type === "noul" && a.noul >= 0.5;
  const ov: Overrides = { path: "jev", nowQ: yes(answers.now_q), replaceAmbient: yes(answers.changes) };
  const a = ch(answers.anchor);
  if (a && a.confidence >= 0.5) ov.cand = a.choice === "none" ? null : (cands[Number(a.choice.slice(1)) - 1] ?? undefined);
  const m = ch(answers.asof);
  if (m && m.confidence >= 0.5 && m.choice in ASOF_LABELS) { ov.mode = m.choice as AsOfMode; ov.confidence = m.confidence; }
  else ov.confidence = m?.confidence ?? 0.6;
  return derive(question, session, cands, ov);
}

export async function parseIntent(question: string, session: Session, opts: { db?: DatabaseSync; jev?: boolean } = {}): Promise<Result> {
  const t0 = performance.now();
  const cands = candidates(question, session.now);
  let res = derive(question, session, cands);
  let error: string | undefined;
  if (opts.jev !== false && jevEnabled()) {
    try { res = await jevLayer(question, session, cands); }
    catch (e) { error = e instanceof Error ? e.message : String(e); res.intent.fallback_reason = error; }
  }
  if (opts.db) trace(opts.db, { tool: "intf.parse", input: question, output: res.intent, path: res.intent.path, ms: Math.round(performance.now() - t0), error });
  return res;
}

export function describeIntent(i: TemporalIntent): string {
  const a = i.anchor;
  const span = a ? (a.start === a.end ? a.start : `${a.start}..${a.end}`) : "";
  const inh = i.basis === "inherited" ? " (inherited from earlier)" : "";
  switch (i.asof_mode) {
    case "current": return "answering for now, checking freshness";
    case "none": return "no time stated, reading as now";
    case "future": return a ? `looking ahead to ${span}` : "looking ahead";
    case "mixed": return `answering as of ${a?.start} and what changed since${inh}`;
    case "range": return `answering for ${span}${inh}`;
    default: return `answering as of ${span}${inh}`;
  }
}
