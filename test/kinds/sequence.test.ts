import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../../freshtime-core/index.ts";
import { build, fact, ingestDir } from "./helpers.ts";

const setup = async () => {
  const { repo } = build("sequence");
  const db = openDb(":memory:");
  await ingestDir(db, repo, "2026-10-10");
  return db;
};

test("two same-day Next: lines in one file: the later line wins", async () => {
  const db = await setup();
  assert.equal(fact(db, "Next: write the lantern parser").invalid_at, "2026-10-09");
  assert.equal(fact(db, "Next: write the lantern tests").invalid_at, null);
});

test("two handoffs with the same date and State section: the later commit wins", { todo: "defect: same-day handoff snapshots never replace each other" }, async () => {
  const db = await setup();
  assert.notEqual(fact(db, "Lantern build is green%").invalid_at, null);
  assert.equal(fact(db, "Lantern build is red%").invalid_at, null);
});
