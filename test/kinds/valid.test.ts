import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { openDb } from "../../dozentimes-core/index.ts";
import { fallbackIntent } from "../../dozentimes-intf/intent.ts";
import { readFacts } from "../../dozentimes-agnt/ledger.ts";
import { build, fact, ingestDir, tmp } from "./helpers.ts";

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

test("a newer Waiting bullet replaces the older one about the same thing", async () => {
  const db = await setup();
  const old = db.prepare("SELECT invalid_at FROM facts WHERE text LIKE 'Waiting on the orchard schema%'").get() as any;
  assert.equal(old.invalid_at, "2026-10-09");
});

test("one ingest of three Next: lines closes each at its successor's date", async () => {
  const { repo } = build("asof");
  const db = openDb(":memory:");
  await ingestDir(db, repo, NOW);
  const closed = (db.prepare("SELECT invalid_at FROM facts WHERE text LIKE 'Next:%' ORDER BY valid_at").all() as any[]).map((r) => r.invalid_at);
  assert.deepEqual(closed, ["2026-10-01", "2026-10-20", null]);
});

const files = async (fs: Record<string, string>) => {
  const dir = tmp("valid"), db = openDb(":memory:");
  for (const [rel, body] of Object.entries(fs)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  await ingestDir(db, dir, NOW);
  return db;
};

test("two Waiting bullets in the same session both stay current", async () => {
  const db = await files({
    "orchard/whats_next.md": "## 2026-10-01 session\n- Waiting on the orchard schema review\n- Waiting on the vendor price sheet\n",
  });
  assert.equal(fact(db, "Waiting on the orchard schema review").invalid_at, null);
  assert.equal(fact(db, "Waiting on the vendor price sheet").invalid_at, null);
});

test("a later Waiting bullet in another file of the project does not replace", async () => {
  const db = await files({
    "orchard/whats_next.md": "## 2026-10-01 session\n- Waiting on the orchard schema review\n",
    "orchard/HANDOFF.md": "## 2026-10-09 session\n- Waiting on the orchard exporter review\n",
  });
  assert.equal(fact(db, "Waiting on the orchard schema review").invalid_at, null);
});

test("a later plain bullet does not replace an earlier one", async () => {
  const db = await files({
    "orchard/whats_next.md":
      "## 2026-10-01 session\n- The orchard importer reads CSV files\n\n## 2026-10-09 session\n- The orchard exporter writes JSON files\n",
  });
  assert.equal(fact(db, "The orchard importer reads CSV files").invalid_at, null);
});

test("a later wait about something else does not replace an earlier wait", async () => {
  const db = await files({
    "orchard/whats_next.md":
      "## 2026-10-01 session\n- Waiting on the vendor price sheet\n\n## 2026-10-09 session\n- Waiting on the DBA for credentials\n",
  });
  assert.equal(fact(db, "Waiting on the vendor price sheet").invalid_at, null);
});
