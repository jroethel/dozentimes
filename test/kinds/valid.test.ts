import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../../freshtime-core/index.ts";
import { fallbackIntent } from "../../freshtime-intf/intent.ts";
import { readFacts } from "../../freshtime-agnt/ledger.ts";
import { build, ingestDir } from "./helpers.ts";

const NOW = "2026-10-10";
const setup = async () => {
  const { repo } = build("valid");
  const db = openDb(":memory:");
  await ingestDir(db, repo, NOW);
  return db;
};
const past = (db: any, q: string) => {
  const { intent } = fallbackIntent(q, { now: NOW, ambient: null });
  return readFacts(db, intent, { now: NOW, ledger: true, verify: false }).facts.filter((f) => f.text.startsWith("Next:"));
};

test("a read before the replacement date returns the old Next: as current_then", async () => {
  const f = past(await setup(), "what was next for orchard as of Oct 5");
  assert.deepEqual(f.map((x) => [x.text, x.status]), [["Next: build the orchard importer", "current_then"]]);
});

test("a read after the replacement date returns the new Next: as current_then", async () => {
  const f = past(await setup(), "what was next for orchard as of Oct 9");
  assert.deepEqual(f.map((x) => [x.text, x.status]), [["Next: wire the orchard exporter", "current_then"]]);
});

test("a current read labels the old Next: replaced and the new one current", async () => {
  const f = readFacts(await setup(), null, { now: NOW, ledger: true, verify: false, query: "orchard next" }).facts;
  const st = Object.fromEntries(f.filter((x) => x.text.startsWith("Next:")).map((x) => [x.text, x.status]));
  assert.deepEqual(st, { "Next: build the orchard importer": "replaced", "Next: wire the orchard exporter": "current" });
});

test("a newer Waiting bullet replaces the older one about the same thing", { todo: "#7" }, async () => {
  const db = await setup();
  const old = db.prepare("SELECT invalid_at FROM facts WHERE text LIKE 'Waiting on the orchard schema%'").get() as any;
  assert.equal(old.invalid_at, "2026-10-09");
});

test("one ingest of three Next: lines closes each at its successor's date", { todo: "defect: a batch ingest closes every older Next: at the newest date" }, async () => {
  const { repo } = build("asof");
  const db = openDb(":memory:");
  await ingestDir(db, repo, NOW);
  const closed = (db.prepare("SELECT invalid_at FROM facts WHERE text LIKE 'Next:%' ORDER BY valid_at").all() as any[]).map((r) => r.invalid_at);
  assert.deepEqual(closed, ["2026-10-01", "2026-10-20", null]);
});
