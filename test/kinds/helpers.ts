// Shared setup for the twelve kind tests. Importing this turns Jev off, so every run is offline and deterministic.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { TemporalIntent } from "../../freshtime-core/index.ts";
import { discoverSources, ingestPaths } from "../../freshtime-agnt/ledger.ts";
import { checkoutAt, genHistory } from "./gen-history.ts";
import type { HistorySpec } from "./gen-history.ts";

process.env.FRESHTIME_JEV = "off";

export const data = <T = any>(kind: string, file = "history.json"): T =>
  JSON.parse(readFileSync(new URL(`./data/${kind}/${file}`, import.meta.url), "utf8"));

export const build = (kind: string) =>
  genHistory(data<HistorySpec>(kind), mkdtempSync(join(tmpdir(), `ft-kind-${kind}-`)));

export const ingestDir = (db: DatabaseSync, dir: string, now: string) => ingestPaths(db, discoverSources([dir]), now);

// Ingest the repo as it stood on each date, at that date's clock, into one work dir.
export async function replay(db: DatabaseSync, repo: string, work: string, dates: string[]): Promise<void> {
  for (const d of dates) {
    rmSync(work, { recursive: true, force: true });
    for (const [rel, body] of Object.entries(checkoutAt(repo, d))) {
      mkdirSync(dirname(join(work, rel)), { recursive: true });
      writeFileSync(join(work, rel), body);
    }
    await ingestDir(db, work, d);
  }
}

export const tmp = (kind: string) => mkdtempSync(join(tmpdir(), `ft-kind-${kind}-`));

export const intent = (over: Partial<TemporalIntent>): TemporalIntent =>
  ({ asof_mode: "current", anchor: null, basis: "default", kinds: [], confidence: 1, path: "fallback", query: "", ...over });

export const fact = (db: DatabaseSync, like: string) =>
  db.prepare("SELECT * FROM facts WHERE text LIKE ?").get(like) as Record<string, any>;
