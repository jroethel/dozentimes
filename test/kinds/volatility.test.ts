import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../../freshtime-core/index.ts";
import { readFacts, summary } from "../../freshtime-agnt/ledger.ts";
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

test("shelf life for status facts is fitted from the checks table", { todo: "#4" }, async () => {
  const db = await setup();
  const id = fact(db, "Blocked on%").id;
  const ins = db.prepare("INSERT INTO checks (fact_id, ts, age_days, changed, reason) VALUES (?, '2026-10-01', 2, 1, 'line gone')");
  for (let i = 0; i < 30; i++) ins.run(id);
  // Every observed status fact had changed by day 2, so a 4-day-old status fact should already need a check.
  assert.equal(statusAt(db, "2026-10-05").status, "needs_check");
});
