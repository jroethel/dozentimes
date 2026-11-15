import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../../dozentimes-core/index.ts";
import { parseIntent } from "../../dozentimes-intf/intent.ts";
import { fireCapsules, listCapsules, readyCapsules, resolveCapsule, sealCapsule } from "../../dozentimes-agnt/capsules.ts";
import { data } from "./helpers.ts";

interface Q { q: string; now: string; mode: string; start?: string; end?: string; topic?: string; miss?: string; hit?: string; passed?: boolean }
const [g, topic, passed] = data<Q[]>("intended", "questions.json");
const read = async (q: string, now: string) => (await parseIntent(q, { now, ambient: null }, { jev: false })).intent;

test("a remind-me question is a future intent anchored in next week", async () => {
  const intent = await read(g.q, g.now);
  assert.equal(intent.asof_mode, g.mode);
  assert.deepEqual([intent.anchor?.start, intent.anchor?.end], [g.start, g.end]);
  assert.ok(intent.kinds.includes("intended"));
});

test("a future intent seals a capsule whose date trigger is the week it named, resolved on the day it was said", async () => {
  const db = openDb(":memory:");
  const c = sealCapsule(db, g.q, await read(g.q, g.now), g.now);
  assert.deepEqual([c.state, c.trigger, c.fire_at, c.due_by, c.anchor_text, c.sealed_at], ["sealed", "date", g.start, g.end, "next week", g.now]);
  assert.equal(listCapsules(db).length, 1);
});

test("the capsule stays sealed before its window, fires on the first check inside it, and fires once", async () => {
  const db = openDb(":memory:");
  const c = sealCapsule(db, g.q, await read(g.q, g.now), g.now);
  assert.deepEqual(fireCapsules(db, "2026-10-25"), []);
  assert.deepEqual(fireCapsules(db, "2026-10-28").map((x) => [x.id, x.state, x.fired_at]), [[c.id, "fired", "2026-10-28"]]);
  assert.deepEqual(fireCapsules(db, "2026-10-29"), []);
  assert.deepEqual(readyCapsules(db).map((x) => x.id), [c.id]);
});

test("firing does not decide: surface and dismiss close it, re-arm seals it again for a later date", async () => {
  const db = openDb(":memory:");
  const intent = await read(g.q, g.now);
  const a = sealCapsule(db, "check the importer", intent, g.now), b = sealCapsule(db, "check the exporter", intent, g.now);
  const c = sealCapsule(db, "check the schema", intent, g.now);
  fireCapsules(db, "2026-10-26");
  assert.equal(resolveCapsule(db, a.id, { action: "surface" }, "2026-10-26").state, "surfaced");
  assert.throws(() => resolveCapsule(db, b.id, { action: "dismiss", reason: " " }, "2026-10-26"), /reason/);
  const d = resolveCapsule(db, b.id, { action: "dismiss", reason: "the exporter was dropped" }, "2026-10-26");
  assert.deepEqual([d.state, d.reason, d.resolved_at], ["dismissed", "the exporter was dropped", "2026-10-26"]);
  const later = await read("in two weeks", "2026-10-26");
  const r = resolveCapsule(db, c.id, { action: "rearm", intent: later }, "2026-10-26");
  assert.deepEqual([r.state, r.fire_at, r.fired_at], ["sealed", "2026-11-09", null]);
  assert.deepEqual(readyCapsules(db), []);
  assert.deepEqual(fireCapsules(db, "2026-11-09").map((x) => x.id), [c.id]);
});

test("a reminder with no date fires when its topic comes back, not on other questions", async () => {
  const db = openDb(":memory:");
  const c = sealCapsule(db, topic.q, await read(topic.q, topic.now), topic.now);
  assert.deepEqual([c.trigger, c.fire_at, c.topic], ["topic", null, topic.topic]);
  assert.deepEqual(fireCapsules(db, "2026-10-23"), []);
  assert.deepEqual(fireCapsules(db, "2026-10-23", topic.miss), []);
  assert.deepEqual(fireCapsules(db, "2026-10-24", topic.hit).map((x) => x.id), [c.id]);
});

test("a topic with a date fires on the topic only from that date", async () => {
  const db = openDb(":memory:");
  const c = sealCapsule(db, "look at the exporter again", await read("next week", g.now), g.now, { topic: "exporter" });
  assert.deepEqual([c.trigger, c.fire_at, c.topic], ["topic", g.start, "exporter"]);
  assert.deepEqual(fireCapsules(db, "2026-10-23", "the exporter is slow"), []);
  assert.deepEqual(fireCapsules(db, "2026-10-27"), []);
  assert.deepEqual(fireCapsules(db, "2026-10-27", "the exporter is slow").map((x) => x.id), [c.id]);
});

test("a date that has already passed is refused, not stored", async () => {
  const db = openDb(":memory:");
  assert.ok(passed.passed);
  await assert.rejects(async () => sealCapsule(db, passed.q, await read(passed.q, passed.now), passed.now), /already passed/);
  assert.deepEqual(listCapsules(db), []);
});

test("a separate time phrase that has passed is refused even when it does not read as future", async () => {
  const db = openDb(":memory:");
  const when = await read("on Oct 3", passed.now);
  assert.equal(when.asof_mode, "past");
  assert.throws(() => sealCapsule(db, "file the VAT return", when, passed.now, { strict: true }), /already passed/);
  assert.deepEqual(listCapsules(db), []);
});
