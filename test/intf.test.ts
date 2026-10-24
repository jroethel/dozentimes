import { test } from "node:test";
import assert from "node:assert/strict";
import { describeIntent, fallbackIntent, parseIntent } from "../dozentimes-intf/intent.ts";
import type { Session } from "../dozentimes-core/contract.ts";

const s0: Session = { now: "2026-10-22", ambient: null };

test("now word -> current", () => {
  const { intent } = fallbackIntent("What is the status of alpha now?", s0);
  assert.equal(intent.asof_mode, "current");
  assert.equal(intent.anchor, null);
  assert.equal(intent.query, "What is the status of alpha");
});

test("as of past date, inheritance, then today clears ambient", () => {
  const t1 = fallbackIntent("What was the plan for alpha as of Oct 14?", s0);
  assert.equal(t1.intent.asof_mode, "past");
  assert.equal(t1.intent.basis, "stated");
  assert.deepEqual([t1.intent.anchor?.start, t1.intent.anchor?.end], ["2026-10-14", "2026-10-14"]);
  assert.equal(t1.intent.query, "What was the plan for alpha");
  assert.equal(t1.session.ambient?.start, "2026-10-14");
  const t2 = fallbackIntent("and what about beta?", t1.session);
  assert.equal(t2.intent.basis, "inherited");
  assert.equal(t2.intent.asof_mode, "past");
  assert.equal(t2.intent.anchor?.start, "2026-10-14");
  assert.equal(describeIntent(t2.intent), "answering as of 2026-10-14 (inherited from earlier)");
  const t3 = fallbackIntent("What is beta's status today?", t2.session);
  assert.equal(t3.intent.asof_mode, "current");
  assert.equal(t3.session.ambient, null);
});

test("since -> mixed", () => {
  const { intent } = fallbackIntent("What changed in alpha since Oct 1?", s0);
  assert.equal(intent.asof_mode, "mixed");
  assert.equal(intent.anchor?.start, "2026-10-01");
});

test("month -> range, back in -> range", () => {
  const { intent } = fallbackIntent("What happened in September?", s0);
  assert.equal(intent.asof_mode, "range");
  assert.deepEqual([intent.anchor?.start, intent.anchor?.end], ["2026-09-01", "2026-09-30"]);
  assert.equal(intent.query, "What happened");
  assert.equal(describeIntent(intent), "answering for 2026-09-01..2026-09-30");
  const b = fallbackIntent("What was decided back in August?", s0).intent;
  assert.deepEqual([b.asof_mode, b.anchor?.start, b.anchor?.end, b.query], ["range", "2026-08-01", "2026-08-31", "What was decided"]);
});

test("between X and Y, last week", () => {
  const b = fallbackIntent("Between Oct 1 and Oct 10, what shipped?", s0).intent;
  assert.deepEqual([b.asof_mode, b.anchor?.start, b.anchor?.end], ["range", "2026-10-01", "2026-10-10"]);
  const w = fallbackIntent("What did the team report last week?", s0).intent;
  assert.deepEqual([w.asof_mode, w.anchor?.start, w.anchor?.end], ["range", "2026-10-12", "2026-10-18"]);
});

test("future", () => {
  const { intent } = fallbackIntent("Remind me next week to check gamma", s0);
  assert.equal(intent.asof_mode, "future");
  assert.equal(intent.anchor?.start, "2026-10-26");
  assert.deepEqual(intent.kinds, ["intended"]);
  assert.equal(intent.query, "to check gamma");
});

test("no time signal -> none, default, ambient untouched", () => {
  const { intent, session } = fallbackIntent("Tell me about gamma", s0);
  assert.equal(intent.asof_mode, "none");
  assert.equal(intent.basis, "default");
  assert.equal(intent.query, "Tell me about gamma");
  assert.equal(session.ambient, null);
});

test("fiscal adds business; inherited range keeps range", () => {
  assert.ok(fallbackIntent("What is the FY budget now?", s0).intent.kinds.includes("business"));
  const t1 = fallbackIntent("What happened in September?", s0);
  assert.equal(fallbackIntent("who was involved?", t1.session).intent.asof_mode, "range");
});

test("parseIntent with jev:false equals fallback and writes a trace", async () => {
  const { openDb } = await import("../dozentimes-core/db.ts");
  const db = openDb(":memory:");
  const r = await parseIntent("What was the plan as of Oct 14?", s0, { jev: false, db });
  assert.equal(r.intent.path, "fallback");
  assert.deepEqual(r.intent, fallbackIntent("What was the plan as of Oct 14?", s0).intent);
  const row = db.prepare("SELECT tool, path FROM traces").get() as { tool: string; path: string };
  assert.deepEqual({ ...row }, { tool: "intf.parse", path: "fallback" });
});

test("fallback: a future word beats an inherited as-of", () => {
  const s1 = fallbackIntent("As of Oct 14, what was the plan for beta?", { now: "2026-10-22", ambient: null }).session;
  assert.equal(fallbackIntent("Will the importer ship?", s1).intent.asof_mode, "future");
});
