// Capsules: intended time, stored. A capsule is a sealed letter to a future reading, after hearth's capsule system
// (swombat/hearth, docs/05-narrative-memory.md). intf reads "remind me next week to ..." into a future anchor at the
// moment it is said, so the relative phrase is resolved against the day it was spoken, never against the day it fires.
//
// The anchor's start is the date trigger and its end is the due date. With no date the capsule fires on its topic.
// Firing only moves sealed to fired. What happens next is the caller's decision: surface it, dismiss it with a reason,
// re-arm it for later, or hold it by doing nothing until a better moment.
import type { DatabaseSync } from "node:sqlite";
import type { Capsule, CapsuleState, TemporalIntent } from "../dozentimes-core/index.ts";
import { trace } from "../dozentimes-core/index.ts";

const STOP = new Set(("a an the and or but to of on in at for with about from by into is are was were be been being it its " +
  "this that these those i me my we us our you your he she they them their what when where how why which who please " +
  "remind remember forget let know again later back up do does did can could should would will just also there here " +
  "next last week weeks month months day days year years today tomorrow yesterday soon then once").split(" "));

const norm = (w: string): string => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

// Content words of a text, singular, without stopwords and short tokens.
export function topicWords(text: string): string[] {
  return [...new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 2 && !STOP.has(w)).map(norm))];
}

// A topic matches a text that holds at least half of its words.
export function topicMatches(topic: string, text: string): boolean {
  const t = topic.split(" ").filter(Boolean);
  if (!t.length) return false;
  const w = new Set(topicWords(text));
  return t.filter((x) => w.has(x)).length * 2 >= t.length;
}

const row = (db: DatabaseSync, id: number): Capsule => {
  const c = db.prepare("SELECT * FROM capsules WHERE id = ?").get(id) as Capsule | undefined;
  if (!c) throw new Error(`no capsule ${id}`);
  return { ...c };
};

// When a trigger can fire, from an intent. A wholly past anchor is an error when it was meant as the date: when the
// intent was read from a separate time phrase (strict), or intf read the question as future. Otherwise it names the
// past content the letter is about, so it is not a trigger and the capsule fires on its topic.
function triggerOf(intent: TemporalIntent, body: string, now: string, topic?: string, strict = false) {
  let a = intent.anchor;
  if (a && a.end < now) {
    if (strict || intent.asof_mode === "future") throw new Error(`"${a.text}" (${a.start}..${a.end}) has already passed; give a future date or a topic`);
    a = null;
  }
  const words = topicWords(topic ?? (a ? "" : intent.query || body));
  if (!a && !words.length) throw new Error("no future date and no topic words to fire on");
  return {
    trigger: (words.length ? "topic" : "date") as Capsule["trigger"],
    fire_at: a ? (a.start > now ? a.start : now) : null,
    due_by: a?.end ?? null,
    topic: words.length ? words.join(" ") : null,
    anchor_text: a?.text ?? null,
  };
}

// Seal a letter. intent is intf's reading of when it should come back; topic, when given, makes it fire on that topic
// (and not before the intent's date, when it has one). strict says the intent was read from a phrase that only names
// the date, so a date in the past is refused.
export function sealCapsule(db: DatabaseSync, body: string, intent: TemporalIntent, now: string, opts: { topic?: string; strict?: boolean } = {}): Capsule {
  if (!body.trim()) throw new Error("a capsule needs a body");
  const t = triggerOf(intent, body, now, opts.topic, opts.strict);
  const r = db.prepare(`INSERT INTO capsules (body, trigger, fire_at, due_by, topic, anchor_text, state, sealed_at)
    VALUES (?, ?, ?, ?, ?, ?, 'sealed', ?)`).run(body.trim(), t.trigger, t.fire_at, t.due_by, t.topic, t.anchor_text, now);
  const c = row(db, Number(r.lastInsertRowid));
  trace(db, { tool: "agnt.capsule.seal", input: { body, anchor: intent.anchor, topic: opts.topic ?? null }, output: { id: c.id, trigger: c.trigger, fire_at: c.fire_at, topic: c.topic } });
  return c;
}

// Move every sealed capsule whose trigger holds to fired, and return those. text is the question being asked now,
// for topic triggers. A capsule fires once: it stays fired until someone resolves it.
export function fireCapsules(db: DatabaseSync, now: string, text = ""): Capsule[] {
  const sealed = db.prepare("SELECT * FROM capsules WHERE state = 'sealed' ORDER BY id").all() as unknown as Capsule[];
  const fire = db.prepare("UPDATE capsules SET state = 'fired', fired_at = ? WHERE id = ? AND state = 'sealed'");
  const out: Capsule[] = [];
  for (const c of sealed) {
    const due = c.fire_at === null || c.fire_at <= now;
    const hit = c.trigger === "date" ? due : due && !!text && topicMatches(c.topic ?? "", text);
    if (hit && (fire.run(now, c.id).changes as number) > 0) out.push(row(db, c.id));
  }
  if (out.length) trace(db, { tool: "agnt.capsule.fire", input: { now, text: text.slice(0, 200) }, output: { fired: out.map((c) => c.id) } });
  return out;
}

export const readyCapsules = (db: DatabaseSync): Capsule[] =>
  (db.prepare("SELECT * FROM capsules WHERE state = 'fired' ORDER BY COALESCE(due_by, fired_at), id").all() as unknown as Capsule[]).map((c) => ({ ...c }));

export const listCapsules = (db: DatabaseSync, state?: CapsuleState): Capsule[] =>
  (state
    ? db.prepare("SELECT * FROM capsules WHERE state = ? ORDER BY id").all(state)
    : db.prepare("SELECT * FROM capsules ORDER BY id").all()).map((c) => ({ ...(c as unknown as Capsule) }));

export type Resolution =
  | { action: "surface" }
  | { action: "dismiss"; reason: string }
  | { action: "rearm"; intent: TemporalIntent; topic?: string };

// The decision on a capsule. surface and dismiss close it, from fired or straight from sealed. rearm takes a fired
// or surfaced capsule back to sealed with a new trigger read from a new intent.
export function resolveCapsule(db: DatabaseSync, id: number, r: Resolution, now: string): Capsule {
  const c = row(db, id);
  if (r.action === "rearm") {
    if (c.state === "sealed" || c.state === "dismissed") throw new Error(`capsule ${id} is ${c.state}; only a fired or surfaced capsule can be re-armed`);
    const t = triggerOf(r.intent, c.body, now, r.topic, true);
    db.prepare(`UPDATE capsules SET state = 'sealed', trigger = ?, fire_at = ?, due_by = ?, topic = ?, anchor_text = ?, fired_at = NULL,
      resolved_at = NULL, reason = NULL WHERE id = ?`).run(t.trigger, t.fire_at, t.due_by, t.topic, t.anchor_text, id);
  } else {
    if (c.state === "surfaced" || c.state === "dismissed") throw new Error(`capsule ${id} is already ${c.state}`);
    if (r.action === "dismiss" && !r.reason?.trim()) throw new Error("dismissing a capsule needs a reason");
    db.prepare("UPDATE capsules SET state = ?, resolved_at = ?, reason = ? WHERE id = ?")
      .run(r.action === "surface" ? "surfaced" : "dismissed", now, r.action === "dismiss" ? r.reason.trim() : null, id);
  }
  const out = row(db, id);
  trace(db, { tool: "agnt.capsule.resolve", input: { id, action: r.action }, output: { state: out.state, fire_at: out.fire_at } });
  return out;
}

export const overdue = (c: Capsule, now: string): boolean => c.state === "fired" && !!c.due_by && now > c.due_by;

// One line per capsule, for tools, the CLI and the system prompt.
export function describeCapsule(c: Capsule, now: string): string {
  const when = c.due_by && c.fire_at
    ? (c.fire_at === c.due_by ? `due ${c.due_by}` : `due ${c.fire_at}..${c.due_by}`) + (c.anchor_text ? ` ("${c.anchor_text}")` : "")
    : "";
  const on = c.topic ? `fires on topic: ${c.topic}` : "";
  const extra = [when, on, overdue(c, now) ? "OVERDUE" : "", c.reason ? `reason: ${c.reason}` : ""].filter(Boolean).join(", ");
  return `#${c.id} [${c.state}] ${c.body} (sealed ${c.sealed_at}${extra ? `, ${extra}` : ""})`;
}
