import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../../freshtime-core/index.ts";
import { build, fact, ingestDir } from "./helpers.ts";

const NOW = "2026-10-22";

test("an undated file with mtime 2026-08-01 imported later is dated by its mtime, not the import", async () => {
  const { repo } = build("source");
  const db = openDb(":memory:");
  await ingestDir(db, repo, NOW);
  const f = fact(db, "%importer reads csv%");
  assert.equal(f.valid_at, "2026-08-01");
  assert.equal(f.source_at, "2026-08-01");
  assert.equal(f.recorded_at, NOW);
});

test("after a fresh clone the source date is still the last commit date", { todo: "not built: git dates" }, async () => {
  const { clone } = build("source");
  const db = openDb(":memory:");
  await ingestDir(db, clone!, NOW);
  const f = fact(db, "%importer reads csv%");
  assert.equal(f.source_at, "2026-08-01");
  assert.equal(f.valid_at, "2026-08-01");
});
