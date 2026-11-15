import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { addDays, openDb } from "../../dozentimes-core/index.ts";
import { maintain, readFacts } from "../../dozentimes-agnt/ledger.ts";
import { CHARGE_HALF_LIFE_DAYS, chargeOf } from "../../dozentimes-agnt/charge.ts";
import { build, fact, ingestDir, tmp } from "./helpers.ts";

const read = (db: DatabaseSync, query: string, now: string) => readFacts(db, null, { now, ledger: true, verify: false, query });
const checked = (db: DatabaseSync): number[] => (db.prepare("SELECT fact_id FROM checks ORDER BY id").all() as any[]).map((r) => r.fact_id);

test("maintain with budget 1 checks the recently read stale fact first", async () => {
  const { repo } = build("access");
  const db = openDb(":memory:");
  await ingestDir(db, repo, "2026-10-06");
  const a = fact(db, "%review the orchard schema%"), b = fact(db, "%review the orchard exporter%");
  // Without access, the older unverified fact (a) would go first.
  read(db, "exporter", "2026-10-19");
  assert.equal(fact(db, "%orchard exporter%").last_accessed_at, "2026-10-19");
  assert.equal(fact(db, "%orchard schema%").last_accessed_at, null);
  assert.deepEqual(await maintain(db, "2026-10-20", 1), { checked: 1, changed: 0, reclassified: 0 });
  assert.deepEqual(checked(db), [b.id]);
  assert.equal(fact(db, "%orchard schema%").last_verified_at, a.last_verified_at);
  assert.equal(fact(db, "%orchard exporter%").last_verified_at, "2026-10-20");
});

test("a read reinforces charge, and charge halves every half-life", async () => {
  const { repo } = build("access");
  const db = openDb(":memory:");
  await ingestDir(db, repo, "2026-10-06");
  const r = read(db, "exporter", "2026-10-06");
  assert.equal(r.facts[0].charge, 0.1);
  const id = fact(db, "%orchard exporter%").id;
  assert.equal(chargeOf(db, id, addDays("2026-10-06", CHARGE_HALF_LIFE_DAYS)), 0.05);
  read(db, "exporter", "2026-10-06");
  assert.ok(Math.abs(chargeOf(db, id, "2026-10-06") - 0.19) < 1e-9, "a second read adds a tenth of the headroom left");
  assert.equal(chargeOf(db, fact(db, "%orchard schema%").id, "2026-10-06"), 0);
});

test("a fact read often outranks a fact read once more recently", async () => {
  const { repo } = build("access");
  const db = openDb(":memory:");
  await ingestDir(db, repo, "2026-10-06");
  const a = fact(db, "%review the orchard schema%");
  for (const d of ["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"]) read(db, "schema", d);
  read(db, "exporter", "2026-10-19");
  // The old rule, most recent read first, would check the exporter.
  await maintain(db, "2026-10-20", 1);
  assert.deepEqual(checked(db), [a.id]);
});

// Three stale checklist items: p and q are about the orchard port, r is older and about the grove.
async function coread(together: boolean) {
  const dir = tmp("access");
  const put = (rel: string, body: string) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), body); };
  put("grove/whats_next.md", "## 2026-09-28 session\n- [ ] tidy the grove readme\n");
  put("orchard/whats_next.md", "## 2026-10-01 session\n- [ ] port the orchard importer to rust\n- [ ] port the orchard exporter to rust\n");
  const db = openDb(":memory:");
  await ingestDir(db, dir, "2026-10-01");
  if (together) read(db, "port orchard importer exporter rust", "2026-10-09");
  else { read(db, "importer", "2026-10-09"); read(db, "exporter", "2026-10-09"); }
  read(db, "grove readme", "2026-10-09");
  // q is ticked off in a later session, so the ledger closes it; p is still open and unconfirmed.
  put("orchard/whats_next.md", "## 2026-10-01 session\n- [ ] port the orchard importer to rust\n- [ ] port the orchard exporter to rust\n\n## 2026-10-12 session\n- [x] port the orchard exporter to rust\n");
  await ingestDir(db, dir, "2026-10-12");
  const p = fact(db, "[ ] port the orchard importer%"), q = fact(db, "[ ] port the orchard exporter%"), r = fact(db, "%grove readme%");
  assert.equal(q.closed_by, "checkbox");
  await maintain(db, "2026-10-20", 1);
  return { db, p, r };
}

test("a stale fact whose co-read companion changed is checked first", async () => {
  const { db, p } = await coread(true);
  assert.deepEqual(checked(db), [p.id]);
});

test("without the co-read, the same change does not move the fact ahead", async () => {
  const { db, r } = await coread(false);
  assert.deepEqual(checked(db), [r.id]);
});

