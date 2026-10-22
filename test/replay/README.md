# Real-data replay

This suite replays the git history of handoff documents through the ledger and scores the ledger against git.
It measures two things.
The as-of check measures how well the ledger answers "what was true on date D" for past dates.
The freshness check measures how well the shelf lives predict which facts change, per volatility class, and by age.
The freshness table is the data issue #4 needs to fit shelf lives.

## Run

`npm run replay`
Flags are `--roots a:b` (default `~/create:~/repos`), `--max-sources N`, `--out DIR`, `--jev` to classify with Jev, and `--show-sample RULE`.
`--show-sample RULE` prints up to 20 evenly spaced unique closures of one rule (for example `handoff_section`) after the report, for a person to grade.
Each case is the closed line, the line that closed it, and the two files' slugs.
The default is keyword classification, which is fast and free, but it labels nearly everything `decision`.
Use `--jev` for a meaningful class table. The report then shows how many facts were classified by Jev and how many fell back to keywords.
It is not part of `npm test`.

## Output

Output goes to `~/.freshtime/replay/<YYYY-MM-DD>/report.md` and `results.json`.
The repo is public, so the code holds only the method.
Reports hold counts and rates, with sources identified by index only.
No file content, fact text, project name or path is written or printed.
The one exception is `--show-sample`, which prints fact text to the terminal only.
It never writes text to `report.md` or `results.json`, and its output must never be redirected into a file in the repo.

## Method

Sources are `whats_next.md`, `HANDOFF.md` and `docs/handoffs/*.md` that exist at HEAD of a git repo and have at least 3 commits.
Each `docs/handoffs` directory with at least 3 commits is also replayed as one evolving source.
Each version is mirrored into a temp dir at a stable path, its mtime is set to the commit date, and it is ingested with `now` set to that date.
Temp dirs and the in-memory ledgers are deleted at the end, and no `ledger.db` is created.

As-of check: sampled dates are every commit date and the midpoint between consecutive commit dates.
The truth set at D is the lines extracted from the git version at the last commit on or before D.
The ledger set at D comes from the facts table with the same predicate readFacts uses for a past anchor, per source, with no retrieval limit.
The docs are append-only logs, so a line that a replacement rule closed while it is still in the file is a rule claim, not a miss.
Results are three buckets:
- (a) git-truth misses: the line is present at D, the ledger says not valid, and no rule replaced it. Causes are dating, closed without a rule, never extracted.
- (b) rule-superseded while present: counted separately and split by rule (checkbox, next, handoff_section).
  The rule is the replaced fact's `closed_by` column, which the ledger sets when a rule closes it.
- (c) precision: false positives, split into backdated lines (heading date earlier than the commit that added them) and missed removals.

Recall is reported against git truth, and also as if rule-superseded lines were misses.
For rule (d) the report checks mechanically whether the superseding fact is in a different file with a different filename slug (date prefix removed), for all unique cases and for an evenly spaced sample of 20.

Freshness check: for each source, up to 5 start versions T1 and up to 5 later versions T2 are paired.
T1 is ingested, the facts flagged `needs_check` at T2 are computed from the shelf lives (`ledger=true`, `verify=false`), then T2 is ingested.
A fact counts as changed only if its line is absent from the T2 version, so the data does not depend on the replacement rules.
Facts that a rule closed on T2 ingest while their line is still present are counted in a separate column.
Each fact takes its class from the main replay ledger, so Jev classifies each line once.

## Why labels come from git

The ledger's own rules decide what it thinks changed, so they cannot grade themselves.
Git records what the file said on each date, independent of those rules.

## Known limits

- Only files that exist at HEAD are found. Deleted and renamed-away files are not.
- Each source has its own ledger, so replacement rules that cross files in a repo are only exercised inside a handoff directory.
- Only the newest 300 versions of a source are replayed.
- Dates have day resolution, so several commits on one day collapse into one sample date.
- Facts that stay unchanged for long are common, so the changed rates reflect handoff files, not all documents.
- Freshness observations from one source are correlated, so rates are descriptive and carry no confidence interval.
- Keyword classification never returns `identity`, so that class is empty unless `--jev` is used.
- The rule (d) slug check passes whenever two handoff files have different slugs, so it cannot tell a new unit of work from a renamed file.
