# Methods for the twelve kinds of time

Each kind has a test file `<kind>.test.ts` and data under `data/<kind>/`.
`gen-history.ts` builds a git repo from `history.json`, with commit dates and file mtimes set apart on purpose.
A todo test is a real assertion that fails today and flips when the feature lands.
`npm run kinds` prints the pass, todo and fail counts per kind.

## event

Method: replay a repo's commits into a ledger, then ask "what did orchard ship in September" and compare the returned facts' dates with the gold set.
Data: `data/event/history.json`.
A pass proves a range question returns facts whose heading date is in the window and drops facts closed before it or opened after it.
Todo: a fact written in October that says "shipped on 2026-09-03" is not counted as a September event, because in-text dates are not read.

## valid

Method: a `Next:` replaced on a known date, read as of dates before and after it, and read now.
Data: `data/valid/history.json`, plus `data/asof/history.json` for the three-Next case.
A pass proves the old Next is `current_then` before the swap, `replaced` now, and the new one answers after.
Todo: #7, a newer "Waiting on" bullet does not replace the older one.

## record

Method: ingest version 1 at clock D1 and version 2 at D2 from the repo history, then read `recorded_at`.
Data: `data/record/history.json`, which has a fact written up late (valid September 12, recorded October 1).
A pass proves `recorded_at` is the first-ingest clock and is not moved by a later ingest.
Todo: "what did we know on September 15" still returns a fact recorded on October 1, because there is no record-time as-of.

## source

Method: import a file with no dated headings and mtime 2026-08-01 on 2026-10-22, then import a fresh clone of the same repo.
Data: `data/source/history.json`, with `clone: true`.
A pass proves the source date comes from the file mtime, not from the import date.
Todo: in the fresh clone the mtime is the clone time, and git commit dates are not used.

## reference

Method: `fallbackIntent` against gold anchors for "last week", "yesterday" and "two weeks ago", including a Sunday and a Monday edge.
Data: `data/reference/questions.json`, `data/reference/history.json`.
A pass proves turn-time phrases resolve against `session.now` with Monday-based weeks.
Todo: "next week we ship the importer" inside a 2026-09-07 document is stored as written and not resolved to the week of 2026-09-14.

## sequence

Method: two same-day `Next:` lines in one file, and two same-day handoff files with the same State section committed in opposite alphabetical order.
Data: `data/sequence/history.json`.
A pass proves file order breaks a same-day tie inside one file.
Todo: defect, the same-day tie between two handoff files is never broken, so both stay current.

## verification

Method: read ledger fields at ingest, append an edit behind the ledger, and read with verify on.
Data: `data/verification/history.json`.
A pass proves ingest stamps the author date with `verified_by` author, a source re-read stamps `source`, and a changed source is caught.
Todo: #3, a user statement that a fact holds cannot be recorded, so `verified_by` user never occurs.

## access

Method: two stale facts where the newer one is read, then `maintain(db, now, 1)`.
Data: `data/access/history.json`.
A pass proves the recently read stale fact is checked first and the other is left alone.
Nothing is todo.

## volatility

Method: read the same ledger at several clocks and compare statuses by class, with identity set directly because offline ingest never assigns it.
Data: `data/volatility/history.json`.
A pass proves status goes `needs_check` after 7 days, decision after 90, and identity never.
Todo: #4, shelf lives are not fitted from the checks table, so 30 early-change checks do not shorten the status shelf life.

## intended

Method: `parseIntent` on "remind me next week to check the importer" against a gold mode and anchor.
Data: `data/intended/questions.json`.
A pass proves a reminder is read as a future intent anchored in the following Monday to Sunday, with the intended kind.
Todo: #8, nothing stores the intent, so no scheduled item exists.

## business

Method: `fallbackIntent` on fiscal-period questions, checking the kind list, then the anchor with a July 1 fiscal start.
Data: `data/business/questions.json`.
A pass proves "FY26" and "Q3 FY26" add the business kind.
Todo: #9, neither phrase gets an anchor, and the `FRESHTIME_FISCAL_START` knob in the test is a proposed name.

## asof

Method: a four-turn conversation with `parseIntent` and `readFacts` per turn, over a ledger built by replaying three commits.
Data: `data/asof/history.json`.
A pass proves a stated date sets the ambient reading, a follow-up inherits it, a new period replaces it, and a "now" question clears it, with ledger statuses to match.
Nothing is todo.
