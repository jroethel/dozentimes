// Freshness ledger: ingest project docs into facts, read by temporal intent, verify against source.
import type { DatabaseSync } from "node:sqlite";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join } from "node:path";
import type { FactStatus, LedgerFact, TemporalIntent, Volatility } from "../freshtime-core/index.ts";
import { SHELF_LIFE_DAYS, askJev, daysBetween, isoDate, jevEnabled, trace } from "../freshtime-core/index.ts";
import type { JevQuestion } from "../freshtime-core/index.ts";

export interface ExtractedFact {
  project: string;
  section: string;
  text: string; // bullet text without "- "; keeps the "[x]"/"[ ]" prefix so both states are distinct rows
  checked: boolean | null; // null when the line is not a checkbox
  valid_at: string;
  source_path: string;
}

const DATE_RE = /\d{4}-\d{2}-\d{2}/;
const NEXT_RE = /^(\[[ xX]\]\s*)?[*_]*next[*_]*\s*:/i;
const STATE_SECTION = /\b(state|status|next|open|blocked|recent|remaining|resume|current)\b/i;
const isHandoff = (p: string): boolean => /\/docs\/handoffs\/[^/]+\.md$/.test(p) || basename(p) === "HANDOFF.md";

export function projectOf(path: string): string {
  const dir = dirname(path);
  const root = basename(dir) === "handoffs" && basename(dirname(dir)) === "docs" ? dirname(dirname(dir)) : dir;
  return basename(root);
}

const stripTags = (h: string): string =>
  h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();

// Learning guides: each <dt> (and the first cell of each table body row) is a fact, under its <h2>.
// Dated by the h2 "(YYYY-MM-DD" if present, else the last date in <title>, else the file mtime.
function extractHtml(path: string, html: string, fileMtime: string): ExtractedFact[] {
  const project = projectOf(path);
  const titleDates = (html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "").match(/\d{4}-\d{2}-\d{2}/g);
  const fileDate = titleDates?.at(-1) ?? fileMtime;
  const out: ExtractedFact[] = [];
  let section = "", date = fileDate;
  const re = /<h2[^>]*>([\s\S]*?)<\/h2>|<dt[^>]*>([\s\S]*?)<\/dt>|<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
  for (const m of html.matchAll(re)) {
    if (m[1] !== undefined) {
      section = stripTags(m[1]);
      date = section.match(DATE_RE)?.[0] ?? fileDate;
      continue;
    }
    const text = stripTags(m[2] ?? m[3] ?? "");
    if (text.length < 12) continue;
    out.push({ project, section, text, checked: null, valid_at: date, source_path: path });
  }
  return out;
}

export function extractFacts(path: string, text: string, fileMtime: string): ExtractedFact[] {
  if (path.endsWith(".html")) return extractHtml(path, text, fileMtime);
  const project = projectOf(path);
  const fileDate = basename(path).match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? fileMtime;
  const out: ExtractedFact[] = [];
  const stack: { level: number; title: string; date: string | null }[] = [];
  let fence = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; continue; }
    if (fence) continue;
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      while (stack.length && stack[stack.length - 1].level >= h[1].length) stack.pop();
      stack.push({ level: h[1].length, title: h[2], date: h[2].match(DATE_RE)?.[0] ?? null });
      continue;
    }
    const b = line.match(/^\s*[-*+]\s+(.*\S)\s*$/);
    if (!b || b[1].length < 12) continue;
    const cb = b[1].match(/^\[([ xX])\]/);
    const dated = [...stack].reverse().find((s) => s.date);
    out.push({
      project,
      section: stack.length ? stack[stack.length - 1].title : "",
      text: b[1],
      checked: cb ? cb[1] !== " " : null,
      valid_at: dated?.date ?? fileDate,
      source_path: path,
    });
  }
  return out;
}

// ---------- classification ----------

export interface Classified { kind: Volatility; path: "jev" | "fallback" | "keyword"; reason?: string }

export function keywordKind(t: string): Volatility {
  const s = t.toLowerCase();
  if (/^\[[ xX]\]/.test(t) || /\bnext\s*:|blocked|in progress|waiting|todo\b|pending/.test(s)) return "status";
  if (/\b(decided|chose|decision)\b|\buse \S+ not \S+/.test(s)) return "decision";
  if (/\b(prefers?|always|never|style)\b/.test(s)) return "preference";
  return "decision";
}

const KIND_CRITERIA: Record<Volatility, string> = {
  identity: "Stable fact about what a project is or who owns it. Almost never changes.",
  preference: "A standing preference, convention or style rule. Changes slowly.",
  decision: "A choice or design decision that may be revisited later.",
  status: "Work state, next step, blocker or checklist item. Changes within days.",
};
const CHUNK = 40;

export async function classify(texts: string[], db?: DatabaseSync): Promise<Classified[]> {
  if (!jevEnabled()) return texts.map((t) => ({ kind: keywordKind(t), path: "keyword" }));
  const res: Classified[] = [];
  for (let i = 0; i < texts.length; i += CHUNK) {
    const chunk = texts.slice(i, i + CHUNK);
    const t0 = performance.now();
    try {
      const questions: Record<string, JevQuestion> = {};
      chunk.forEach((t, j) => {
        questions[`q${j}`] = {
          type: "choice",
          instructions: `How fast does this line from a project handoff document go out of date? Line: ${t.slice(0, 400)}`,
          criteria: KIND_CRITERIA,
        };
      });
      const { answers } = await askJev("Lines from project handoff and status documents.", questions, 30000);
      chunk.forEach((t, j) => {
        const a = answers[`q${j}`];
        const k = a && a.type === "choice" ? (a.choice as Volatility) : undefined;
        res.push(k && k in KIND_CRITERIA ? { kind: k, path: "jev" } : { kind: keywordKind(t), path: "fallback", reason: "bad jev answer" });
      });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      if (db) trace(db, { tool: "agnt.classify", input: `${chunk.length} texts`, path: "fallback", error: reason, ms: Math.round(performance.now() - t0) });
      res.push(...chunk.map((t): Classified => ({ kind: keywordKind(t), path: "fallback", reason })));
    }
  }
  return res;
}

// ---------- ingest ----------

type FactRow = Record<string, any>;
const hashOf = (c: string | null): string => (c === null ? "missing" : createHash("sha1").update(c).digest("hex"));
const mtimeDate = (path: string): string => (existsSync(path) ? isoDate(statSync(path).mtime) : "");

// Sync core. kinds maps fact text to a classification; missing texts fall back to keywords.
function ingestCore(db: DatabaseSync, path: string, now: string, kinds: Map<string, Classified>): { added: number; replaced: number } {
  const mtime = mtimeDate(path) || now;
  const content = existsSync(path) ? readFileSync(path, "utf8") : null;
  const facts = content === null ? [] : extractFacts(path, content, mtime);
  let added = 0, replaced = 0;
  const get = db.prepare("SELECT id, invalid_at, replaced_by FROM facts WHERE source_path = ? AND section = ? AND text = ?");
  // ponytail: a removed line that comes back is reopened, so the gap between removal and return is lost.
  // Keep one row per validity window if gap history ever matters.
  const reopen = db.prepare("UPDATE facts SET invalid_at = NULL WHERE id = ?");
  const ins = db.prepare(`INSERT INTO facts (project, section, text, source_path, kind, kind_path, valid_at, recorded_at, source_at, last_verified_at, verified_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'author')`);
  const seen = new Set<string>();
  const newIds: { id: number; f: ExtractedFact }[] = [];
  for (const f of facts) {
    seen.add(f.section + "\u0000" + f.text);
    const prior = get.get(path, f.section, f.text) as FactRow | undefined;
    if (prior) {
      if (prior.invalid_at && prior.replaced_by === null) reopen.run(prior.id);
      continue;
    }
    const c = kinds.get(f.text) ?? { kind: keywordKind(f.text), path: "keyword" as const };
    // Reading a line is not checking it: the last confirmation is when its author wrote it down.
    const r = ins.run(f.project, f.section, f.text, path, c.kind, c.path, f.valid_at, now, mtime, f.valid_at);
    newIds.push({ id: Number(r.lastInsertRowid), f });
    added++;
  }
  const mark = db.prepare("UPDATE facts SET invalid_at = ?, replaced_by = ? WHERE id = ? AND invalid_at IS NULL");
  // (a) "[ ] x" replaced by "[x] x" in the same file
  for (const { id, f } of newIds) {
    if (f.checked !== true) continue;
    const body = f.text.replace(/^\[[xX]\]\s*/, "");
    const olds = db.prepare("SELECT id, text FROM facts WHERE source_path = ? AND invalid_at IS NULL AND text LIKE '[ ]%'").all(path) as FactRow[];
    for (const o of olds) if (o.text.replace(/^\[ \]\s*/, "") === body) replaced += mark.run(f.valid_at, id, o.id).changes as number;
  }
  // (b) a "Next:" is replaced by its successor in the same project: the next later-dated one, or the next one
  //     further down the same file on the same day. Each closes at its successor's date, not the newest one's.
  const project = facts[0]?.project ?? projectOf(path);
  const nexts = (db.prepare("SELECT id, text, valid_at, source_path FROM facts WHERE project = ? AND invalid_at IS NULL ORDER BY valid_at ASC, id ASC").all(project) as FactRow[])
    .filter((r) => NEXT_RE.test(r.text));
  nexts.forEach((o, i) => {
    const succ = nexts.slice(i + 1).find((n) => n.valid_at > o.valid_at || n.source_path === o.source_path);
    if (succ) replaced += mark.run(succ.valid_at, succ.id, o.id).changes as number;
  });
  // (d) handoffs are snapshots: a state-like section in a later handoff replaces the same section in earlier ones
  if (isHandoff(path)) {
    const sections = new Set(facts.map((f) => f.section.toLowerCase()).filter((t) => STATE_SECTION.test(t)));
    for (const sec of sections) {
      const rows = (db.prepare("SELECT id, valid_at, source_path FROM facts WHERE project = ? AND lower(section) = ? AND invalid_at IS NULL ORDER BY valid_at DESC, id ASC").all(project, sec) as FactRow[])
        .filter((r) => isHandoff(r.source_path));
      const latest = rows[0];
      if (!latest) continue;
      for (const o of rows) {
        if (o.valid_at < latest.valid_at && o.source_path !== latest.source_path) replaced += mark.run(latest.valid_at, latest.id, o.id).changes as number;
      }
    }
  }
  // (c) lines gone from the file
  const live = db.prepare("SELECT id, section, text FROM facts WHERE source_path = ? AND invalid_at IS NULL").all(path) as FactRow[];
  for (const r of live) if (!seen.has(r.section + "\u0000" + r.text)) replaced += mark.run(now, null, r.id).changes as number;
  db.prepare("INSERT OR REPLACE INTO sources (path, hash, ingested_at) VALUES (?, ?, ?)").run(path, hashOf(content), now);
  return { added, replaced };
}

export async function ingestFile(db: DatabaseSync, path: string, now: string): Promise<{ added: number; replaced: number }> {
  const t0 = performance.now();
  const mtime = mtimeDate(path) || now;
  const facts = existsSync(path) ? extractFacts(path, readFileSync(path, "utf8"), mtime) : [];
  const get = db.prepare("SELECT 1 FROM facts WHERE source_path = ? AND section = ? AND text = ?");
  const fresh = [...new Set(facts.filter((f) => !get.get(path, f.section, f.text)).map((f) => f.text))];
  const cls = fresh.length ? await classify(fresh, db) : [];
  const kinds = new Map(fresh.map((t, i) => [t, cls[i]]));
  const r = ingestCore(db, path, now, kinds);
  trace(db, { tool: "agnt.ingest", input: path, output: r, ms: Math.round(performance.now() - t0) });
  return r;
}

export async function ingestPaths(db: DatabaseSync, paths: string[], now: string): Promise<{ added: number; replaced: number }> {
  const total = { added: 0, replaced: 0 };
  for (const p of paths) {
    const r = await ingestFile(db, p, now);
    total.added += r.added;
    total.replaced += r.replaced;
  }
  return total;
}

export function discoverSources(roots: string[]): string[] {
  const found = new Set<string>();
  const walk = (dir: string, depth: number): void => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (depth + 1 < 4) walk(p, depth + 1);
      } else if (e.isFile()) {
        const inHandoffs = e.name.endsWith(".md") && basename(dir) === "handoffs" && basename(dirname(dir)) === "docs";
        const guide = /^learning_guide.*\.html$/.test(e.name);
        if (e.name === "whats_next.md" || e.name === "HANDOFF.md" || inHandoffs || guide) found.add(p);
      }
    }
  };
  for (const r of roots) walk(r, 0);
  return [...found].sort();
}

// ---------- read ----------

const needsCheck = (kind: Volatility, lastVerified: string, now: string): boolean => {
  const life = SHELF_LIFE_DAYS[kind];
  return life !== null && daysBetween(lastVerified, now) > life;
};

const toFact = (r: FactRow, status: FactStatus): LedgerFact => ({
  id: r.id, project: r.project, section: r.section, text: r.text, source_path: r.source_path, kind: r.kind,
  valid_at: r.valid_at, invalid_at: r.invalid_at, recorded_at: r.recorded_at, source_at: r.source_at,
  last_verified_at: r.last_verified_at, verified_by: r.verified_by, last_accessed_at: r.last_accessed_at, status,
});

const currentStatus = (r: FactRow, now: string, ledger: boolean): FactStatus =>
  r.invalid_at ? "replaced" : ledger && needsCheck(r.kind, r.last_verified_at, now) ? "needs_check" : "current";

export function ftsQuery(q: string): string {
  const toks = [...new Set((q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => t.length > 1))];
  return toks.map((t) => `"${t}"`).join(" OR ");
}

export function readFacts(
  db: DatabaseSync,
  intent: TemporalIntent | null,
  opts: { now: string; ledger: boolean; verify: boolean; limit?: number; query?: string },
): { facts: LedgerFact[]; checks: number; caught: number } {
  const t0 = performance.now();
  const mode = intent?.asof_mode ?? "current";
  const anchor = intent?.anchor ?? null;
  const q = ftsQuery(intent?.query ?? opts.query ?? "");
  let checks = 0, caught = 0;
  let facts: LedgerFact[] = [];
  const past = anchor && (mode === "past" || mode === "range" || mode === "mixed");
  const retrieve = (verify: boolean): LedgerFact[] => {
    if (!q) return [];
    const out: LedgerFact[] = [];
    const pastSql = "(f.valid_at <= @end AND (f.invalid_at IS NULL OR f.invalid_at > @start))";
    const where = !past ? "" : mode === "mixed" ? ` AND (${pastSql} OR (f.invalid_at IS NULL AND f.valid_at > @end))` : ` AND ${pastSql}`;
    const params: Record<string, string | number> = { q, lim: opts.limit ?? 8 };
    if (past) { params.start = anchor.start; params.end = anchor.end; }
    // ponytail: text match picks a pool, then live and newer facts win the slots. A real ranker would blend the two.
    const lim = Number(params.lim);
    params.lim = lim * 5;
    const rows = (db.prepare(`SELECT f.* FROM facts_fts JOIN facts f ON f.id = facts_fts.rowid WHERE facts_fts MATCH @q${where} ORDER BY bm25(facts_fts) LIMIT @lim`).all(params) as FactRow[])
      .sort((a, b) => Number(!!a.invalid_at) - Number(!!b.invalid_at) || (a.valid_at < b.valid_at ? 1 : a.valid_at > b.valid_at ? -1 : 0))
      .slice(0, lim);
    const wasValid = (r: FactRow): boolean => r.valid_at <= anchor!.end && (!r.invalid_at || r.invalid_at > anchor!.start);
    for (let r of rows) {
      let status: FactStatus;
      if (past && (mode !== "mixed" || wasValid(r))) status = "current_then";
      else {
        status = currentStatus(r, opts.now, opts.ledger);
        if (status === "needs_check" && verify) {
          checks++;
          if (verifyFact(db, r.id, opts.now)) caught++;
          r = db.prepare("SELECT * FROM facts WHERE id = ?").get(r.id) as FactRow;
          status = currentStatus(r, opts.now, opts.ledger);
        }
      }
      out.push(toFact(r, status));
    }
    return out;
  };
  facts = retrieve(opts.ledger && opts.verify);
  // a caught change may have ingested replacement facts, so retrieve once more without verifying
  if (caught > 0) facts = retrieve(false);
  const upd = db.prepare("UPDATE facts SET last_accessed_at = ?, access_count = access_count + 1 WHERE id = ?");
  for (const f of facts) upd.run(opts.now, f.id);
  trace(db, {
    tool: "agnt.read",
    input: { mode, anchor: anchor?.text ?? null, query: q, ledger: opts.ledger, verify: opts.verify },
    output: { n: facts.length, checks, caught },
    path: intent?.path,
    ms: Math.round(performance.now() - t0),
  });
  return { facts, checks, caught };
}

// ---------- verify and maintain ----------

// Returns true when the fact changed (replaced or gone). Re-ingests the source first if it changed since last ingest,
// so replacement rules run. Verified only if the fact is still present and not invalidated.
export function verifyFact(db: DatabaseSync, id: number, now: string): boolean {
  const f = db.prepare("SELECT * FROM facts WHERE id = ?").get(id) as FactRow | undefined;
  if (!f) throw new Error(`no fact ${id}`);
  const content = existsSync(f.source_path) ? readFileSync(f.source_path, "utf8") : null;
  const known = db.prepare("SELECT hash FROM sources WHERE path = ?").get(f.source_path) as FactRow | undefined;
  if (known?.hash !== hashOf(content)) ingestCore(db, f.source_path, now, new Map());
  const cur = db.prepare("SELECT invalid_at FROM facts WHERE id = ?").get(id) as FactRow;
  const present = content !== null && extractFacts(f.source_path, content, mtimeDate(f.source_path))
    .some((x) => x.section === f.section && x.text === f.text);
  const ok = present && !cur.invalid_at;
  db.prepare("INSERT INTO checks (fact_id, ts, age_days, changed, reason) VALUES (?, ?, ?, ?, ?)")
    .run(id, new Date().toISOString(), daysBetween(f.last_verified_at, now), ok ? 0 : 1,
      content === null ? "file missing" : !present ? "line gone" : cur.invalid_at ? "replaced on re-ingest" : "line present");
  if (ok) db.prepare("UPDATE facts SET last_verified_at = ?, verified_by = 'source' WHERE id = ?").run(now, id);
  else db.prepare("UPDATE facts SET invalid_at = ? WHERE id = ? AND invalid_at IS NULL").run(now, id);
  return !ok;
}

export function maintain(db: DatabaseSync, now: string, budget: number): { checked: number; changed: number } {
  const rows = (db.prepare("SELECT id, kind, last_verified_at FROM facts WHERE invalid_at IS NULL ORDER BY last_accessed_at IS NULL, last_accessed_at DESC, last_verified_at ASC").all() as FactRow[])
    .filter((r) => needsCheck(r.kind, r.last_verified_at, now));
  let checked = 0, changed = 0;
  for (const r of rows) {
    if (checked >= budget) break;
    // an earlier re-ingest may have invalidated this one already
    const cur = db.prepare("SELECT invalid_at FROM facts WHERE id = ?").get(r.id) as FactRow;
    if (cur.invalid_at) continue;
    checked++;
    if (verifyFact(db, r.id, now)) changed++;
  }
  trace(db, { tool: "agnt.maintain", input: { budget }, output: { checked, changed } });
  return { checked, changed };
}

export function summary(db: DatabaseSync, now: string) {
  const rows = db.prepare("SELECT project, kind, invalid_at, last_verified_at FROM facts").all() as FactRow[];
  const byStatus: Record<string, number> = { current: 0, needs_check: 0, replaced: 0 };
  const byKind: Record<string, number> = {};
  const proj: Record<string, number> = {};
  for (const r of rows) {
    byStatus[currentStatus(r, now, true)]++;
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
    proj[r.project] = (proj[r.project] ?? 0) + 1;
  }
  const byProject = Object.entries(proj).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const fallbacks = (db.prepare("SELECT COUNT(*) AS n FROM traces WHERE path = 'fallback' AND error IS NOT NULL").get() as FactRow).n as number;
  const kindPaths = db.prepare("SELECT kind_path, COUNT(*) AS n FROM facts GROUP BY kind_path").all() as FactRow[];
  const lastIngest = (db.prepare("SELECT MAX(ts) AS ts FROM traces WHERE tool = 'agnt.ingest'").get() as FactRow).ts as string | null;
  return { total: rows.length, byStatus, byKind, byProject, fallbacks, kindPaths: Object.fromEntries(kindPaths.map((r) => [r.kind_path, r.n])), lastIngest };
}
