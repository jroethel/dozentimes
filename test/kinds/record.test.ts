import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../../freshtime-core/index.ts";
import { readFacts } from "../../freshtime-agnt/ledger.ts";
import { build, fact, intent, replay, tmp } from "./helpers.ts";

const D1 = "2026-09-10", D2 = "2026-10-01";
const setup = async () => {
  const { repo } = build("record");
  const db = openDb(":memory:");
  await replay(db, repo, tmp("record-work"), [D1, D2]);
  return db;
};

test("recorded_at is the clock a fact was first ingested at, and re-ingest does not move it", async () => {
  const db = await setup();
  assert.equal(fact(db, "%importer reads csv%").recorded_at, D1);
  assert.equal(fact(db, "%exporter writes json%").recorded_at, D2);
});

test("a late write-up is valid in September but recorded in October", async () => {
  const f = fact(await setup(), "%exporter writes json%");
  assert.equal(f.valid_at, "2026-09-12");
  assert.notEqual(f.recorded_at, f.valid_at);
});

test("what did we know on D1 returns only facts recorded by D1", { todo: "not built: record-time as-of" }, async () => {
  const db = await setup();
  const it = intent({ asof_mode: "past", anchor: { start: "2026-09-15", end: "2026-09-15", text: "Sep 15" }, basis: "stated", query: "orchard" });
  const texts = readFacts(db, it, { now: "2026-10-22", ledger: true, verify: false }).facts.map((f) => f.text);
  assert.deepEqual(texts, ["Decided orchard importer reads csv only"]);
});
