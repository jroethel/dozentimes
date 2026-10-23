import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../../freshtime-core/index.ts";
import { maintain, readFacts } from "../../freshtime-agnt/ledger.ts";
import { build, fact, ingestDir } from "./helpers.ts";

test("maintain with budget 1 checks the recently read stale fact first", async () => {
  const { repo } = build("access");
  const db = openDb(":memory:");
  await ingestDir(db, repo, "2026-10-06");
  const a = fact(db, "%review the orchard schema%"), b = fact(db, "%review the orchard exporter%");
  // Without access, the older unverified fact (a) would go first.
  readFacts(db, null, { now: "2026-10-19", ledger: true, verify: false, query: "exporter" });
  assert.equal(fact(db, "%orchard exporter%").last_accessed_at, "2026-10-19");
  assert.equal(fact(db, "%orchard schema%").last_accessed_at, null);
  assert.deepEqual(await maintain(db, "2026-10-20", 1), { checked: 1, changed: 0, reclassified: 0 });
  const ids = (db.prepare("SELECT fact_id FROM checks").all() as any[]).map((r) => r.fact_id);
  assert.deepEqual(ids, [b.id]);
  assert.equal(fact(db, "%orchard schema%").last_verified_at, a.last_verified_at);
  assert.equal(fact(db, "%orchard exporter%").last_verified_at, "2026-10-20");
});
