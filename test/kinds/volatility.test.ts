import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../../dozentimes-core/index.ts";
import { readFacts, shelfLives, summary } from "../../dozentimes-agnt/ledger.ts";
import { build, fact, ingestDir } from "./helpers.ts";

const setup = async () => {
  const { repo } = build("volatility");
  const db = openDb(":memory:");
  await ingestDir(db, repo, "2026-10-02");
  // Identity needs Jev to be assigned at ingest. Offline, set it directly to test the read side.
  db.prepare("UPDATE facts SET kind = 'identity' WHERE text LIKE '%field sensor logger%'").run();
  return db;
};
const statusAt = (db: any, now: string) =>
  Object.fromEntries(readFacts(db, null, { now, ledger: true, verify: false, query: "lantern vendor sqlite sensor" }).facts.map((f) => [f.kind, f.status]));

test("keywords classify the three offline classes", async () => {
  const db = await setup();
  assert.equal(fact(db, "Blocked on%").kind, "status");
  assert.equal(fact(db, "Decided to store%").kind, "decision");
});

test("a status fact needs a check after 8 days, a decision stays current", async () => {
  const db = await setup();
  assert.deepEqual(statusAt(db, "2026-10-08"), { status: "current", decision: "current", identity: "current" });
  assert.deepEqual(statusAt(db, "2026-10-09"), { status: "needs_check", decision: "current", identity: "current" });
});

test("a decision goes stale after 90 days and identity never does", async () => {
  const db = await setup();
  assert.equal(statusAt(db, "2026-12-30").decision, "current");
  assert.deepEqual(statusAt(db, "2027-01-02"), { status: "needs_check", decision: "needs_check", identity: "current" });
  assert.equal(statusAt(db, "2036-10-01").identity, "current");
  assert.equal(summary(db, "2036-10-01").byStatus.current, 1);
});

// Checks for 30 distinct status facts. The fit reads checks.kind, so the fact ids need no facts rows.
const checks = (db: any, n: number, age: number, changed: (i: number) => number, reason = "line gone", first = 1000) => {
  const ins = db.prepare("INSERT INTO checks (fact_id, ts, age_days, changed, reason, kind) VALUES (?, '2026-10-01', ?, ?, ?, 'status')");
  for (let i = 0; i < n; i++) ins.run(first + i, age, changed(i), reason);
};

test("shelf life for status facts is fitted from the checks table", async () => {
  const db = await setup();
  checks(db, 30, 2, () => 1);
  // Every observed status fact had changed by day 2, so a 4-day-old status fact should already need a check.
  assert.equal(statusAt(db, "2026-10-05").status, "needs_check");
});

test("fewer than 30 distinct facts keep the hand-set shelf life", async () => {
  const db = await setup();
  checks(db, 29, 2, () => 1);
  const again = db.prepare("INSERT INTO checks (fact_id, ts, age_days, changed, reason, kind) VALUES (1000, '2026-10-01', 2, 1, 'line gone', 'status')");
  for (let i = 0; i < 40; i++) again.run(); // 40 more checks of a fact already counted
  assert.deepEqual(shelfLives(db).status, { days: 7, n: 69, facts: 29, user: 0, fitted: false });
  assert.equal(statusAt(db, "2026-10-05").status, "current");
});

test("user statements are reported but not fitted", async () => {
  const db = await setup();
  checks(db, 30, 2, () => 1, "user: changed");
  assert.deepEqual(shelfLives(db).status, { days: 7, n: 0, facts: 0, user: 30, fitted: false });
});

test("a class that rarely changes is fitted longer than its hand-set value", async () => {
  const db = await setup();
  checks(db, 30, 10, (i) => (i === 0 ? 1 : 0), "line present");
  const s = shelfLives(db).status;
  assert.equal(s.fitted, true);
  assert.ok(s.days !== null && s.days >= 80 && s.days <= 90, `days ${s.days}`); // 1 of 30 changed by day 10: about 84 days
  assert.equal(statusAt(db, "2026-10-20").status, "current");
});
