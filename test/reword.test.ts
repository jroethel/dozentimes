import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { openDb } from "../dozentimes-core/index.ts";
import { ingestFile, verifyFact } from "../dozentimes-agnt/ledger.ts";

process.env.DOZENTIMES_JEV = "off";
const tmp = () => mkdtempSync(join(tmpdir(), "dt-reword-"));
const write = (dir: string, rel: string, body: string) => {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
  return p;
};
const row = (db: DatabaseSync, text: string) =>
  db.prepare("SELECT * FROM facts WHERE text = ?").get(text) as Record<string, any>;
const HEAD = "## 2026-10-01 session\n";
const BEFORE = "The orchard cache lives in sqlite under the shared data dir for now";
const AFTER = "The orchard cache lives in sqlite under the shared data directory for now";

test("a reworded bullet closes the old row and keeps its later verification", async () => {
  const dir = tmp(), db = openDb(":memory:");
  const p = write(dir, "alpha/whats_next.md", `${HEAD}- ${BEFORE}\n`);
  await ingestFile(db, p, "2026-10-01");
  assert.equal(verifyFact(db, row(db, BEFORE).id, "2026-10-12"), false);
  writeFileSync(p, `${HEAD}- ${AFTER}\n`);
  await ingestFile(db, p, "2026-10-15");
  const was = row(db, BEFORE), now = row(db, AFTER);
  assert.deepEqual([was.invalid_at, was.replaced_by, was.closed_by], ["2026-10-15", now.id, "reworded"]);
  assert.deepEqual([now.last_verified_at, now.verified_by], ["2026-10-12", "source"]);
});

test("a one-word change in a short line is a change, not a rewording", async () => {
  const dir = tmp(), db = openDb(":memory:");
  const p = write(dir, "alpha/whats_next.md", `${HEAD}- Lantern build is green on main\n- Next: write the lantern parser\n`);
  await ingestFile(db, p, "2026-10-01");
  writeFileSync(p, `${HEAD}- Lantern build is red on main\n- Next: write the lantern tests\n`);
  await ingestFile(db, p, "2026-10-02");
  assert.equal(row(db, "Lantern build is green on main").closed_by, "removed");
  assert.equal(row(db, "Next: write the lantern parser").closed_by, "next");
});

test("a verify that finds only a rewording records no change in checks", async () => {
  const dir = tmp(), db = openDb(":memory:");
  const p = write(dir, "alpha/whats_next.md", `${HEAD}- ${BEFORE}\n`);
  await ingestFile(db, p, "2026-10-01");
  const id = row(db, BEFORE).id;
  writeFileSync(p, `${HEAD}- ${AFTER}\n`);
  assert.equal(verifyFact(db, id, "2026-10-20"), true);
  const c = db.prepare("SELECT changed, reason FROM checks WHERE fact_id = ?").get(id) as Record<string, any>;
  assert.deepEqual({ ...c }, { changed: 0, reason: "reworded" });
  assert.deepEqual([row(db, AFTER).last_verified_at, row(db, AFTER).verified_by], ["2026-10-20", "source"]);
});

test("a changed number or an added not in a long line is a change, not a rewording", async () => {
  const dir = tmp(), db = openDb(":memory:");
  const PORT = "The importer listens on port 8080 behind the shared nginx proxy for now";
  const SHIP = "We will ship the importer behind the feature flag this week";
  const p = write(dir, "alpha/whats_next.md", `${HEAD}- ${PORT}\n- ${SHIP}\n`);
  await ingestFile(db, p, "2026-10-01");
  writeFileSync(p, `${HEAD}- ${PORT.replace("8080", "8081")}\n- ${SHIP.replace("will", "will not")}\n`);
  await ingestFile(db, p, "2026-10-02");
  assert.equal(row(db, PORT).closed_by, "removed");
  assert.equal(row(db, SHIP).closed_by, "removed");
});

test("a reworded line that is changed back is live again", async () => {
  const dir = tmp(), db = openDb(":memory:");
  const p = write(dir, "alpha/whats_next.md", `${HEAD}- ${BEFORE}\n`);
  await ingestFile(db, p, "2026-10-01");
  writeFileSync(p, `${HEAD}- ${AFTER}\n`);
  await ingestFile(db, p, "2026-10-02");
  writeFileSync(p, `${HEAD}- ${BEFORE}\n`);
  await ingestFile(db, p, "2026-10-03");
  assert.deepEqual([row(db, BEFORE).invalid_at, row(db, BEFORE).closed_by], [null, null]);
  assert.equal(row(db, AFTER).invalid_at, "2026-10-03");
});
