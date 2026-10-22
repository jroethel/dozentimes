import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../../freshtime-core/index.ts";
import { parseIntent } from "../../freshtime-intf/intent.ts";
import { data } from "./helpers.ts";

interface Q { q: string; now: string; mode: string; start: string; end: string }
const [g] = data<Q[]>("intended", "questions.json");

test("a remind-me question is a future intent anchored in next week", async () => {
  const { intent } = await parseIntent(g.q, { now: g.now, ambient: null }, { jev: false });
  assert.equal(intent.asof_mode, g.mode);
  assert.deepEqual([intent.anchor?.start, intent.anchor?.end], [g.start, g.end]);
  assert.ok(intent.kinds.includes("intended"));
});

test("a future intent produces a scheduled item that can fire", { todo: "#8" }, async () => {
  const db = openDb(":memory:");
  await parseIntent(g.q, { now: g.now, ambient: null }, { db, jev: false });
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as any[]).map((r) => r.name);
  const sched = tables.find((t) => /sched|remind|intend/.test(t));
  assert.ok(sched, "no table for scheduled items");
  assert.equal((db.prepare(`SELECT COUNT(*) n FROM ${sched}`).get() as any).n, 1);
});
