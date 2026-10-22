// Real-data replay from git. Replays the history of handoff documents through the ledger and scores it against git.
// Real content never leaves the process: output is counts and rates only, written under ~/.freshtime/replay/<date>/.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { Volatility } from "../../freshtime-core/index.ts";
import { SHELF_LIFE_DAYS, addDays, daysBetween, isoDate, openDb, parseIso } from "../../freshtime-core/index.ts";
import { extractFacts, handoffSlug, ingestFile } from "../../freshtime-agnt/ledger.ts";

// ---------- args ----------
const argv = process.argv.slice(2);
const flag = (n: string): string | undefined => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const roots = (flag("--roots") ?? [join(homedir(), "create"), join(homedir(), "repos")].join(":")).split(":").filter(Boolean);
const maxSources = Number(flag("--max-sources") ?? Infinity);
const outDir = flag("--out") ?? join(homedir(), ".freshtime", "replay", isoDate(new Date()));
const useJev = argv.includes("--jev");
const showSample = flag("--show-sample"); // prints fact text to the terminal only, never to report.md or results.json
if (!useJev) process.env.FRESHTIME_JEV = "off"; // keyword classification: fast, free, deterministic

const MIN_COMMITS = 3;
const MAX_VERSIONS = 300; // newest N versions per source; older history is dropped (counted in the report)
const PAIR_T1 = 5, PAIR_T2 = 5; // freshness pairs per source: up to 5 start versions x 5 later versions

// ---------- git ----------
const git = (cwd: string, args: string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1 << 29, stdio: ["ignore", "pipe", "ignore"] });
const gitOk = (cwd: string, args: string[]): string | null => { try { return git(cwd, args); } catch { return null; } };

function findRepos(root: string, depth: number, out: Set<string>): void {
  let entries;
  try { entries = readdirSync(root, { withFileTypes: true }); } catch { return; }
  if (entries.some((e) => e.name === ".git")) out.add(realpathSync(root));
  if (depth >= 4) return;
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".") || e.name === "node_modules") continue;
    findRepos(join(root, e.name), depth + 1, out);
  }
}

interface Commit { rev: string; date: string; path: string }
type Source = { kind: "file"; repo: string; path: string; rel: string } | { kind: "group"; repo: string; dir: string };
interface Version { date: string; files: Map<string, string> } // files keyed by mirrored relative path

const skips: Record<string, number> = {};
const skip = (why: string): void => { skips[why] = (skips[why] ?? 0) + 1; };

function fileCommits(repo: string, path: string): Commit[] {
  const out = gitOk(repo, ["log", "--follow", "--name-only", "--format=%x01%H %cs", "--", path]);
  if (out === null) return [];
  return out.split("\x01").filter(Boolean).map((chunk) => {
    const [head, ...rest] = chunk.split("\n");
    const [rev, date] = head.split(" ");
    return { rev, date, path: rest.find((l) => l.trim()) ?? path };
  });
}
const dirCommits = (repo: string, dir: string): Commit[] =>
  (gitOk(repo, ["log", "--format=%H %cs", "--", dir]) ?? "").split("\n").filter(Boolean).map((l) => {
    const [rev, date] = l.split(" ");
    return { rev, date, path: dir };
  });

function discover(): { sources: Source[]; commitsOf: Map<Source, Commit[]>; repos: number } {
  const repos = new Set<string>();
  for (const r of roots) findRepos(r, 0, repos);
  const sources: Source[] = [];
  const commitsOf = new Map<Source, Commit[]>();
  for (const repo of [...repos].sort()) {
    const listed = gitOk(repo, ["ls-files", "-z", "--", ":(glob)**/whats_next.md", ":(glob)**/HANDOFF.md", ":(glob)**/docs/handoffs/*.md"]);
    if (listed === null) { skip("git_error"); continue; }
    const files = listed.split("\0").filter(Boolean);
    const dirs = new Set<string>();
    for (const f of files) {
      const inHandoffs = /(^|\/)docs\/handoffs\/[^/]+\.md$/.test(f);
      if (inHandoffs) dirs.add(dirname(f));
      const s: Source = { kind: "file", repo, path: f, rel: inHandoffs ? `docs/handoffs/${basename(f)}` : basename(f) };
      const c = fileCommits(repo, f);
      if (c.length < MIN_COMMITS) { skip(inHandoffs ? "handoff_file_under_3_commits" : "file_under_3_commits"); continue; }
      sources.push(s); commitsOf.set(s, c);
    }
    for (const d of dirs) {
      const s: Source = { kind: "group", repo, dir: d };
      const c = dirCommits(repo, d);
      if (c.length < MIN_COMMITS) { skip("handoff_dir_under_3_commits"); continue; }
      sources.push(s); commitsOf.set(s, c);
    }
  }
  return { sources, commitsOf, repos: repos.size };
}

// ---------- versions ----------
function loadVersions(src: Source, commits: Commit[]): Version[] {
  const chrono = [...commits].reverse().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)); // stable
  const picked = chrono.slice(-MAX_VERSIONS);
  if (picked.length < chrono.length) skips["versions_dropped_beyond_cap"] = (skips["versions_dropped_beyond_cap"] ?? 0) + chrono.length - picked.length;
  const blobs = new Map<string, string>();
  const blob = (repo: string, oid: string): string => {
    let b = blobs.get(oid);
    if (b === undefined) { b = git(repo, ["cat-file", "blob", oid]); blobs.set(oid, b); }
    return b;
  };
  return picked.map((c): Version => {
    const files = new Map<string, string>();
    if (src.kind === "file") {
      const t = gitOk(src.repo, ["show", `${c.rev}:${c.path}`]);
      if (t !== null) files.set(src.rel, t);
    } else {
      const ls = gitOk(src.repo, ["ls-tree", "-r", c.rev, "--", src.dir]) ?? "";
      for (const line of ls.split("\n")) {
        const m = line.match(/^\d+ blob (\w+)\t(.*)$/);
        if (!m || dirname(m[2]) !== src.dir || !m[2].endsWith(".md")) continue;
        files.set(`docs/handoffs/${basename(m[2])}`, blob(src.repo, m[1]));
      }
    }
    return { date: c.date, files };
  });
}

// Writes the next version into dir, setting mtime to the commit date. Returns the changed or removed relative paths.
function apply(dir: string, prev: Map<string, string>, v: Version): string[] {
  const changed: string[] = [];
  const when = parseIso(v.date);
  for (const [rel, c] of v.files) {
    if (prev.get(rel) === c) continue;
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, c);
    utimesSync(p, when, when);
    changed.push(rel);
  }
  for (const rel of prev.keys()) if (!v.files.has(rel)) { rmSync(join(dir, rel), { force: true }); changed.push(rel); }
  return changed.sort();
}

// ---------- stats ----------
type Cnt = Record<string, number>;
const bump = (c: Cnt, k: string, n = 1): void => { c[k] = (c[k] ?? 0) + n; };
const ratio = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 10000) / 10000 : null);
const key = (rel: string, section: string, text: string): string => `${rel}\0${section}\0${text}`;

// fn = git-truth misses (no rule replaced the line). ruleSuperseded = line present at D but closed by a replacement rule.
interface AsOf { samples: number; tp: number; fp: number; fn: number; ruleSuperseded: number; fnCause: Cnt; ruleCause: Cnt; fpCause: Cnt }
const newAsOf = (): AsOf => ({ samples: 0, tp: 0, fp: 0, fn: 0, ruleSuperseded: 0, fnCause: {}, ruleCause: {}, fpCause: {} });
// A rule-superseded fact seen at least once, for the rule (d) over-reach check and --show-sample.
// closed and by hold fact text, so they stay in memory and only --show-sample prints them.
interface Case { rule: string; diffFile: boolean; diffSlug: boolean; closed: string; by: string; slug: string; bySlug: string }

function truthOf(dir: string, v: Version): Set<string> {
  const s = new Set<string>();
  for (const [rel, c] of v.files) for (const f of extractFacts(join(dir, rel), c, v.date)) s.add(key(rel, f.section, f.text));
  return s;
}

interface Row { id: number; key: string; rel: string; text: string; kind: Volatility; kind_path: string; valid_at: string; invalid_at: string | null; replaced_by: number | null; closed_by: string; recorded_at: string }

function asOfCheck(dir: string, versions: Version[], rows: Row[], a: AsOf, cases: Map<number, Case>): void {
  const dates = new Set<string>();
  versions.forEach((v, i) => {
    dates.add(v.date);
    const n = versions[i + 1];
    if (n && n.date > v.date) { const mid = addDays(v.date, Math.floor(daysBetween(v.date, n.date) / 2)); if (mid > v.date) dates.add(mid); }
  });
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const truths = new Map<number, Set<string>>();
  for (const D of [...dates].sort()) {
    let idx = -1;
    versions.forEach((v, i) => { if (v.date <= D) idx = i; });
    if (idx < 0) continue;
    if (!truths.has(idx)) truths.set(idx, truthOf(dir, versions[idx]));
    const truth = truths.get(idx)!;
    // Same predicate readFacts uses for a past anchor with start = end = D.
    const valid = new Set(rows.filter((r) => r.valid_at <= D && (r.invalid_at === null || r.invalid_at > D)).map((r) => r.key));
    a.samples++;
    for (const k of truth) {
      if (valid.has(k)) { a.tp++; continue; }
      const r = byKey.get(k);
      if (r && r.invalid_at !== null && r.invalid_at <= D && r.replaced_by !== null && r.valid_at <= D) {
        a.ruleSuperseded++;
        const sup = byId.get(r.replaced_by);
        const rule = r.closed_by;
        bump(a.ruleCause, rule);
        if (!cases.has(r.id)) cases.set(r.id, { rule, diffFile: !!sup && sup.rel !== r.rel, diffSlug: !!sup && handoffSlug(sup.rel) !== handoffSlug(r.rel),
          closed: r.text, by: sup?.text ?? "", slug: handoffSlug(r.rel), bySlug: sup ? handoffSlug(sup.rel) : "" });
        continue;
      }
      a.fn++;
      bump(a.fnCause, !r ? "never_extracted" : r.valid_at > D ? "dating" : r.invalid_at !== null && r.invalid_at <= D ? "closed_without_rule" : "other");
    }
    for (const k of valid) {
      if (truth.has(k)) continue;
      a.fp++;
      bump(a.fpCause, byKey.get(k)!.recorded_at > D ? "backdated_not_yet_in_file" : "missed_removal");
    }
  }
}

// ---------- freshness ----------
const BUCKETS = ["0-7", "8-30", "31-90", "91+"] as const;
const bucketOf = (age: number): (typeof BUCKETS)[number] => (age <= 7 ? "0-7" : age <= 30 ? "8-30" : age <= 90 ? "31-90" : "91+");
const CLASSES: Volatility[] = ["status", "decision", "preference", "identity"];
interface Fresh { n: number; flagged: number; changed: number; both: number; ruleOnly: number; bucket: Record<string, { n: number; changed: number }> }
const newFresh = (): Fresh => ({ n: 0, flagged: 0, changed: 0, both: 0, ruleOnly: 0, bucket: Object.fromEntries(BUCKETS.map((b) => [b, { n: 0, changed: 0 }])) });

const pick = (n: number, k: number): number[] =>
  n <= k ? [...Array(n).keys()] : [...new Set(Array.from({ length: k }, (_, i) => Math.round((i * (n - 1)) / (k - 1))))];

// kinds: class per fact key from the main replay ledger, so Jev classifies each text once. Pair ingests use keyword mode.
async function freshnessCheck(versions: Version[], fr: Record<string, Fresh>, misc: Cnt, kinds: Map<string, Volatility>): Promise<void> {
  const prevJev = process.env.FRESHTIME_JEV;
  process.env.FRESHTIME_JEV = "off";
  const t1s = pick(versions.length - 1, PAIR_T1);
  for (const i of t1s) {
    const later = versions.length - 1 - i;
    for (const off of pick(later, PAIR_T2)) {
      const j = i + 1 + off;
      const dir = mkdtempSync(join(tmpdir(), "fr-pair-"));
      try {
        const db = openDb(":memory:");
        let ch = apply(dir, new Map(), versions[i]);
        for (const rel of ch) await ingestFile(db, join(dir, rel), versions[i].date);
        const t1 = db.prepare("SELECT id, section, text, source_path, kind, last_verified_at FROM facts WHERE invalid_at IS NULL").all() as any[];
        ch = apply(dir, versions[i].files, versions[j]);
        for (const rel of ch) await ingestFile(db, join(dir, rel), versions[j].date);
        const inv = new Map((db.prepare("SELECT id, invalid_at FROM facts").all() as any[]).map((r) => [r.id, r.invalid_at]));
        const t2 = truthOf(dir, versions[j]);
        const T2 = versions[j].date;
        for (const f of t1) {
          const age = daysBetween(f.last_verified_at, T2);
          if (age < 0) { bump(misc, "freshness_obs_future_dated_excluded"); continue; }
          const rel = f.source_path.slice(dir.length + 1);
          const kind = kinds.get(key(rel, f.section, f.text)) ?? (f.kind as Volatility);
          const life = SHELF_LIFE_DAYS[kind];
          const flagged = life !== null && age > life; // needsCheck under ledger=true, verify=false
          const changed = !t2.has(key(rel, f.section, f.text)); // git truth only: line absent from the T2 version
          const ruleOnly = !changed && inv.get(f.id) !== null; // closed by a rule while still in the file
          const c = (fr[kind] ??= newFresh());
          c.n++; if (flagged) c.flagged++; if (changed) c.changed++; if (flagged && changed) c.both++; if (ruleOnly) c.ruleOnly++;
          const b = c.bucket[bucketOf(age)]; b.n++; if (changed) b.changed++;
        }
        bump(misc, "freshness_pairs");
        db.close();
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
  }
  if (prevJev === undefined) delete process.env.FRESHTIME_JEV; else process.env.FRESHTIME_JEV = prevJev;
}

// ---------- report ----------
function table(head: string[], rows: (string | number | null)[][]): string {
  const cells = [head, ...rows.map((r) => r.map((c) => (c === null ? "-" : String(c))))];
  const w = head.map((_, i) => Math.max(...cells.map((r) => r[i].length)));
  const line = (r: string[]): string => `| ${r.map((c, i) => c.padEnd(w[i])).join(" | ")} |`;
  return [line(cells[0]), `| ${w.map((n) => "-".repeat(n)).join(" | ")} |`, ...cells.slice(1).map(line)].join("\n");
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const { sources: all, commitsOf, repos } = discover();
  const sources = all.slice(0, maxSources);
  const tmpRoot = mkdtempSync(join(tmpdir(), "fr-replay-"));
  const asof = newAsOf();
  const fr: Record<string, Fresh> = {};
  const misc: Cnt = {};
  const perSource: Record<string, unknown>[] = [];
  const allCases: Case[] = [];
  const kindPaths: Cnt = {};
  let used = 0;
  try {
    for (const [idx, src] of sources.entries()) {
      const dir = join(tmpRoot, `s${idx}`);
      try {
        const versions = loadVersions(src, commitsOf.get(src)!);
        if (versions.filter((v) => v.files.size > 0).length < 2) { skip("fewer_than_2_versions_with_content"); continue; }
        const db = openDb(":memory:");
        let prev = new Map<string, string>();
        for (const v of versions) {
          for (const rel of apply(dir, prev, v)) await ingestFile(db, join(dir, rel), v.date);
          prev = v.files;
        }
        const rows = (db.prepare("SELECT id, source_path, section, text, kind, kind_path, valid_at, invalid_at, replaced_by, closed_by, recorded_at FROM facts").all() as any[])
          .map((r): Row => ({ id: r.id, rel: r.source_path.slice(dir.length + 1), text: r.text, kind: r.kind, kind_path: r.kind_path, key: key(r.source_path.slice(dir.length + 1), r.section, r.text), valid_at: r.valid_at, invalid_at: r.invalid_at, replaced_by: r.replaced_by, closed_by: r.closed_by, recorded_at: r.recorded_at }));
        const a = newAsOf();
        const cases = new Map<number, Case>();
        asOfCheck(dir, versions, rows, a, cases);
        allCases.push(...cases.values());
        for (const r of rows) bump(kindPaths, r.kind_path);
        asof.samples += a.samples; asof.tp += a.tp; asof.fp += a.fp; asof.fn += a.fn; asof.ruleSuperseded += a.ruleSuperseded;
        for (const [k, n] of Object.entries(a.fnCause)) bump(asof.fnCause, k, n);
        for (const [k, n] of Object.entries(a.ruleCause)) bump(asof.ruleCause, k, n);
        for (const [k, n] of Object.entries(a.fpCause)) bump(asof.fpCause, k, n);
        db.close();
        rmSync(dir, { recursive: true, force: true });
        await freshnessCheck(versions, fr, misc, new Map(rows.map((r) => [r.key, r.kind])));
        used++;
        perSource.push({ index: idx, type: src.kind, versions: versions.length, facts: rows.length, samples: a.samples, precision: ratio(a.tp, a.tp + a.fp), recall_git: ratio(a.tp, a.tp + a.fn), rule_superseded: a.ruleSuperseded });
        process.stderr.write(`\rsources done: ${used}/${sources.length}`);
      } catch (e) {
        skip(`error_${e instanceof Error ? e.name : "unknown"}`);
      }
    }
  } finally { rmSync(tmpRoot, { recursive: true, force: true }); }
  process.stderr.write("\n");

  const seconds = Math.round((Date.now() - t0) / 1000);
  // Rule (d) over-reach check: is the superseding fact in a different file about a different unit of work (different slug)?
  const dCases = allCases.filter((c) => c.rule === "handoff_section");
  const real = (c: Case): boolean => c.diffFile && c.diffSlug;
  const spaced = (cs: Case[]): Case[] => (cs.length <= 20 ? cs : Array.from({ length: 20 }, (_, i) => cs[Math.floor((i * cs.length) / 20)]));
  const sample = spaced(dCases);
  const overreach = {
    unique_rule_d_cases: dCases.length, real_all: dCases.filter(real).length, share_all: ratio(dCases.filter(real).length, dCases.length),
    sample_size: sample.length, real_sample: sample.filter(real).length, share_sample: ratio(sample.filter(real).length, sample.length),
    unique_cases_by_rule: allCases.reduce((m: Cnt, c) => (bump(m, c.rule), m), {}),
  };
  const res = {
    run_date: isoDate(new Date()), classification: useJev ? "jev" : "keyword", seconds,
    classification_paths: kindPaths,
    sources: { repos, qualifying_found: all.length, attempted: sources.length, used, skipped: skips },
    as_of: {
      method: "ledger valid-at-D set computed from the facts table with the readFacts past predicate (valid_at <= D and (invalid_at is null or invalid_at > D)), per source, no retrieval limit",
      samples: asof.samples, tp: asof.tp, fp: asof.fp,
      git_truth_misses: asof.fn, git_truth_miss_causes: asof.fnCause,
      rule_superseded_while_present: asof.ruleSuperseded, rule_superseded_by_rule: asof.ruleCause,
      precision: ratio(asof.tp, asof.tp + asof.fp), false_positive_causes: asof.fpCause,
      precision_excluding_backdated: ratio(asof.tp, asof.tp + asof.fp - (asof.fpCause["backdated_not_yet_in_file"] ?? 0)),
      recall_git: ratio(asof.tp, asof.tp + asof.fn),
      recall_if_rule_supersedes_counted_as_misses: ratio(asof.tp, asof.tp + asof.fn + asof.ruleSuperseded),
      rule_d_overreach: overreach,
    },
    freshness: { pairs: misc["freshness_pairs"] ?? 0, excluded_future_dated: misc["freshness_obs_future_dated_excluded"] ?? 0,
      changed_means: "line absent from the T2 version (git truth only)",
      classes: CLASSES.map((k) => {
        const c = fr[k] ?? newFresh();
        return { class: k, shelf_life_days: SHELF_LIFE_DAYS[k], n: c.n, flagged: c.flagged, changed: c.changed, flagged_and_changed: c.both, rule_replaced_but_present: c.ruleOnly,
          precision: ratio(c.both, c.flagged), recall: ratio(c.both, c.changed), changed_rate: ratio(c.changed, c.n),
          by_age: Object.fromEntries(BUCKETS.map((b) => [b, { n: c.bucket[b].n, changed: c.bucket[b].changed, rate: ratio(c.bucket[b].changed, c.bucket[b].n) }])) };
      }) },
    per_source: perSource,
  };

  const f = res.freshness.classes;
  const A = res.as_of;
  const md = [
    `# Replay report ${res.run_date}`,
    "",
    `Classification: ${res.classification}. Run time: ${seconds} seconds.`,
    "Counts and rates only. No file content, names or paths are recorded.",
    "",
    "## Sources",
    "",
    table(["Measure", "Count"], [["git repos found", repos], ["qualifying sources found", all.length], ["sources attempted", sources.length], ["sources used", used],
      ...Object.entries(skips).map(([k, v]) => [`skipped: ${k}`, v])]),
    "",
    "## Classification path",
    "",
    "Facts by how their volatility class was decided (jev, fallback after a Jev error, or keyword).",
    "",
    table(["Path", "Facts"], Object.entries(kindPaths)),
    "",
    "## As-of check",
    "",
    "The ledger's valid-at-D set is read from the facts table with the readFacts past predicate, per source, with no retrieval limit.",
    `Samples: ${asof.samples}. True positives: ${asof.tp}.`,
    "These docs are append-only logs, so a rule-superseded line that is still in the file is a rule claim, not a git-truth miss.",
    "",
    table(["Bucket", "Cause", "Count"], [
      ...Object.entries(asof.fnCause).map(([k, v]) => ["(a) git-truth miss", k, v]),
      ...Object.entries(asof.ruleCause).map(([k, v]) => ["(b) rule-superseded while present", k, v]),
      ...Object.entries(asof.fpCause).map(([k, v]) => ["(c) false positive", k, v])]),
    "",
    `Precision: ${A.precision}. Precision excluding backdated lines: ${A.precision_excluding_backdated}.`,
    `Recall against git truth (rule-superseded excluded): ${A.recall_git}. Recall if rule-superseded were counted as misses: ${A.recall_if_rule_supersedes_counted_as_misses}.`,
    "",
    "Rule (d) over-reach check: the superseding fact is in a different file and a different filename slug.",
    "",
    table(["Set", "Cases", "Real over-reach", "Share"], [
      ["all unique rule (d) cases", overreach.unique_rule_d_cases, overreach.real_all, overreach.share_all],
      ["sample of 20 (evenly spaced)", overreach.sample_size, overreach.real_sample, overreach.share_sample]]),
    "",
    "## Freshness check",
    "",
    `Pairs: ${res.freshness.pairs}. Observations excluded as future-dated: ${res.freshness.excluded_future_dated}.`,
    "Flagged means needs_check at T2 under the ledger shelf lives. Changed means the line is absent from the T2 version, which is git truth only.",
    "Rule-replaced means a rule closed the fact on T2 ingest while its line is still present. It is not counted as changed.",
    "",
    table(["Class", "Shelf days", "N", "Flagged", "Changed", "Rule-replaced", "Precision", "Recall", "Changed rate"],
      f.map((c) => [c.class, c.shelf_life_days, c.n, c.flagged, c.changed, c.rule_replaced_but_present, c.precision, c.recall, c.changed_rate])),
    "",
    "Share changed by age since last verified, per class (changed / n).",
    "",
    table(["Class", ...BUCKETS], f.map((c) => [c.class, ...BUCKETS.map((b) => { const x = c.by_age[b] as { n: number; changed: number; rate: number | null }; return `${x.rate ?? "-"} (${x.changed}/${x.n})`; })])),
    "",
  ].join("\n");

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "results.json"), JSON.stringify(res, null, 2));
  writeFileSync(join(outDir, "report.md"), md);
  console.log(md);
  if (showSample) {
    const cs = spaced(allCases.filter((c) => c.rule === showSample));
    console.log(`\n## Sample of ${cs.length} ${showSample} closures (terminal only)\n`);
    cs.forEach((c, i) => console.log(`${i + 1}. [${c.slug}] ${c.closed}\n   closed by [${c.bySlug}] ${c.by}`));
  }
}

await main();
