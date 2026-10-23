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

test("a user statement that a fact still holds verifies it, verified_by user", async () => {
  const { db } = await setup();
  const id = fact(db, "[ ] ship the orchard%").id;
  assert.deepEqual(ledger.recordStatement(db, id, { holds: true }, "2026-10-20"), { id, replaced_by: null });
  const f = fact(db, "[ ] ship the orchard%");
  assert.deepEqual([f.verified_by, f.last_verified_at], ["user", "2026-10-20"]);
  const c = db.prepare("SELECT age_days, changed, reason FROM checks WHERE fact_id = ?").get(id) as Record<string, any>;
  assert.deepEqual({ ...c }, { age_days: 19, changed: 0, reason: "user: holds" });
});

test("a user statement with a new value replaces the fact with a conversation fact that survives re-ingest", async () => {
  const { repo, db } = await setup();
  const old = fact(db, "Decided orchard cache lives in sqlite");
  const r = ledger.recordStatement(db, old.id, { holds: false, text: "Decided orchard cache lives in redis" }, "2026-10-20");
  const neu = fact(db, "Decided orchard cache lives in redis");
  assert.equal(r.replaced_by, neu.id);
  assert.deepEqual([neu.source_path, neu.verified_by, neu.valid_at, neu.kind], ["conversation:orchard", "user", "2026-10-20", old.kind]);
  await ingestDir(db, repo, "2026-10-21");
  assert.equal(fact(db, "Decided orchard cache lives in sqlite").invalid_at, "2026-10-20");
  assert.equal(fact(db, "Decided orchard cache lives in redis").invalid_at, null);
});

test("a user statement that a fact changed, with no new value, survives re-ingest", async () => {
  const { repo, db } = await setup();
  const id = fact(db, "Decided orchard cache lives in sqlite").id;
  assert.deepEqual(ledger.recordStatement(db, id, { holds: false }, "2026-10-20"), { id, replaced_by: null });
  await ingestDir(db, repo, "2026-10-21");
  const f = fact(db, "Decided orchard cache lives in sqlite");
  assert.deepEqual([f.invalid_at, f.closed_by], ["2026-10-20", "user"]);
});

test("a stale conversation fact is never sent to a source re-read", async () => {
  const { db } = await setup();
  const old = fact(db, "Decided orchard cache lives in sqlite");
  ledger.recordStatement(db, old.id, { holds: false, text: "Decided orchard cache lives in redis" }, "2026-10-02");
  const r = readFacts(db, null, { now: "2027-02-01", ledger: true, verify: true, query: "redis" });
  assert.equal(r.checks, 0);
  const f = r.facts.find((x) => x.text.includes("redis"));
  assert.equal(f?.status, "needs_check");
  assert.throws(() => ledger.verifyFact(db, f!.id, "2027-02-01"), /conversation/);
});

test("saying a user-closed fact still holds undoes the close", async () => {
  const { db } = await setup();
  const old = fact(db, "Decided orchard cache lives in sqlite");
  ledger.recordStatement(db, old.id, { holds: false, text: "Decided orchard cache lives in redis" }, "2026-10-20");
  assert.deepEqual(ledger.recordStatement(db, old.id, { holds: true }, "2026-10-21"), { id: old.id, replaced_by: null });
  const f = fact(db, "Decided orchard cache lives in sqlite");
  assert.deepEqual([f.invalid_at, f.closed_by, f.replaced_by, f.verified_by], [null, null, null, "user"]);
  const neu = fact(db, "Decided orchard cache lives in redis");
  assert.deepEqual([neu.invalid_at, neu.closed_by], ["2026-10-21", "user"]);
});
