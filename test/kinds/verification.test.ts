import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { openDb } from "../../freshtime-core/index.ts";
import * as ledger from "../../freshtime-agnt/ledger.ts";
import { build, fact, ingestDir } from "./helpers.ts";

const { readFacts } = ledger;
const setup = async () => {
  const { repo } = build("verification");
  const db = openDb(":memory:");
  await ingestDir(db, repo, "2026-10-02");
  return { repo, db };
};

test("at ingest, last_verified_at is the author date and verified_by is author", async () => {
  const { db } = await setup();
  const f = fact(db, "%orchard cache lives in sqlite%");
  assert.equal(f.last_verified_at, "2026-10-01");
  assert.equal(f.verified_by, "author");
});

test("an edit appended behind the ledger is caught by a verifying read", async () => {
  const { repo, db } = await setup();
  appendFileSync(join(repo, "orchard/whats_next.md"), "\n## 2026-10-19 session\n- [x] ship the orchard importer\n");
  const r = readFacts(db, null, { now: "2026-10-20", ledger: true, verify: true, query: "ship the orchard importer" });
  assert.equal(r.checks, 1);
  assert.equal(r.caught, 1);
  const st = Object.fromEntries(r.facts.map((f) => [f.text, f.status]));
  assert.equal(st["[ ] ship the orchard importer"], "replaced");
  assert.equal(st["[x] ship the orchard importer"], "current");
  const checked = db.prepare("SELECT verified_by FROM facts WHERE text LIKE '[x]%'").get() as any;
  assert.equal(checked.verified_by, "author");
});

test("a source re-read stamps verified_by source", async () => {
  const { db } = await setup();
  const r = readFacts(db, null, { now: "2026-10-20", ledger: true, verify: true, query: "ship the orchard importer" });
  assert.equal(r.checks, 1);
  assert.equal(r.caught, 0);
  assert.equal(fact(db, "[ ] ship the orchard%").verified_by, "source");
});

test("a user statement that a fact still holds verifies it, verified_by user", { todo: "#3" }, async () => {
  const { db } = await setup();
  const record = (ledger as any).recordStatement;
  assert.equal(typeof record, "function", "no way to record a statement made in conversation");
  record(db, fact(db, "[ ] ship the orchard%").id, "still holds", "2026-10-20");
  assert.equal(fact(db, "[ ] ship the orchard%").verified_by, "user");
});
