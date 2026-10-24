---
doctype: technical-brief
personas: architecture-reviewer
sources: README.md, whats_next.md, learning_guide.html, docs/plans/2026-10-22.pi-time-poc.md, docs/plans/2026-10-22.test-suites.md, docs/research/jev-api.md, docs/research/pi-extensions.md, dozentimes-core/, dozentimes-intf/intent.ts, dozentimes-agnt/ledger.ts, pi-time/, test/, docs/content/dozentimes-design/runs-2026-10-22.txt
status: draft
ledger: claims-ledger.md
---

# dozentimes: two time tools, one contract

Lede: How dozentimes-core, dozentimes-intf, dozentimes-agnt and pi-time fit together on branch feat/pi-time-poc, what the six test layers show, and what to build next.

Meta, for: Jeremy Roethel, project owner.
Meta, state: branch feat/pi-time-poc at commit e9ef5f7, 2026-10-22. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:2]
Meta, numbers: Re-run for this page on 2026-10-22, except the replay and end-to-end suites, which are read from their latest results (Section 06). [src: docs/content/dozentimes-design/runs-2026-10-22.txt:127]
Meta, background: The "Two tools, one contract" and "Gaps" sections of the October 2026 memory-systems research page on time coverage. [src: docs/plans/2026-10-22.pi-time-poc.md:3]
Meta, content master: docs/content/dozentimes-design/content.md.

## The answer

Verdict mark label: The answer

Verdict, lead: dozentimes is two small time tools that share one contract, and on the synthetic test the pair shows every fact with the right status and nothing false as true, which neither tool does alone. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:40-49]

dozentimes-intf reads which time a question is about: now, a past date, a span, the future, or a past date plus what changed since. [src: dozentimes-core/contract.ts:4]
dozentimes-agnt keeps dated facts from project docs, knows when each one goes stale, and re-reads the source before it shows a stale fact as current. [src: dozentimes-agnt/ledger.ts:1]
pi-time is pi launched with both tools in its own agent directory, over a ledger built from project docs. [src: pi-time/pi-time:1-4]

The 1+1=3 test runs seven questions under four setups: no tools, intent only, ledger only, and both. [src: README.md:60-62]
Status accuracy adds up: from a 36% baseline, intent alone gains 43 points, the ledger alone 21, and both together 64, so the interaction term is 0.00. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:40-48]
Harm falls by more than the sum: intent alone removes 2 of the 4 false-as-true facts, the ledger alone removes none, and both together remove all 4, an interaction of -2. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:40-49]
With a fresh ledger per question the pair spends 9 source re-reads where the ledger alone spends 24. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:65-69]
The fixtures are synthetic, so this shows the mechanism and not a rate on real data.
On 21 contrived questions Jev reads 9 of the 10 traps that fool the rules, where the rules read none, so Jev's value on real questions still waits on the blind set in #1. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:113-117]

Verdict, next: A fresh session works the open issues in the order in Section 08, starting with #12, gated by the suites, and #1 waits on about 50 blind questions from you. [src: whats_next.md:53] [src: docs/content/dozentimes-design/runs-2026-10-22.txt:159-172]

## Architecture

A question passes through the four parts in one direction.
dozentimes-core holds the contract and the plumbing both tools share: the types, the SQLite schema, the trace writer, the clock and the Jev client. [src: README.md:7]
dozentimes-intf turns a prompt plus conversation state into a TemporalIntent. [src: README.md:8]
dozentimes-agnt reads the ledger at the time that intent names and re-checks stale facts against their source files. [src: README.md:9]
pi-time wires both into pi through one extension: a hook reads every prompt, and four tools expose the pair to the model. [src: pi-time/agent/extensions/dozentimes/index.ts:229-233]

Jev sits inside dozentimes-intf as an optional judge, and a rule-based fallback answers whenever Jev is off or fails. [src: dozentimes-intf/intent.ts:1-2]
Every parse, ingest, read and maintenance pass writes a row to the traces table inside the same ledger file. [src: dozentimes-core/db.ts:46-55]

Figure 1 title: One question through the four parts

Figure 1 caption: An example run of the first question in the synthetic script, "What is the next step for alpha now?".
The Jev step and the statuses follow the end-to-end run, where Jev read the question as current at confidence 0.98 and the answer held 6 current and 2 replaced facts. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:157]
The re-read counts follow the ablation with the ledger carried, where the same question re-read 4 facts and caught 2 changes. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:32] [src: docs/content/dozentimes-design/runs-2026-10-22.txt:44]
The fallback path is drawn dotted because this run used Jev.
The log times are the replay's clock, not measured latency.

Figure 1 alt text: A question replayed through pi-time, dozentimes-intf and dozentimes-agnt: the hook reads the prompt, code finds date phrases, Jev picks the labels, the TemporalIntent goes to the ledger read, stale facts are re-read from their source files, trace rows go to the ledger file, and the answer returns with a status per fact.

```
Figure 1 strings
panels: pi-time | dozentimes-intf | dozentimes-agnt | dozentimes-core
stations: prompt (you) | hook, before_agent_start | candidates, chrono-node and code math | Jev, picks labels only | fallback rules, on any Jev error | TemporalIntent, the contract | ledger read, FTS5, status by mode | re-check source, needs_check facts only | answer, a status per fact | ledger.db, facts, checks, sources, traces
pills: trace rows | both ways
legend: you | code | Jev judgment | the contract | fallback
log:
you | "What is the next step for alpha now?" | [prompt] | run
pi-time | before_agent_start asks for a reading | [hook] | run
intf | chrono-node finds no date phrase | 0 candidates [ok] | ok
Jev | one batched call: which mode, and is this about right now | current, now yes [jev ok] | ok
intf | code applies the guards and builds the reading | current, default basis [reading] | ok
pi-time | reading goes into the system prompt and the status line, the model calls dozentimes_ask | [tool call] | run
agnt | text match over the facts, 4 are past their shelf life | 4 [needs_check] | run
agnt | re-reads their source files and re-ingests the changed ones | 2 of 4 [changed] | back
agnt | retrieves again after the re-ingest ran the replacement rules | [current, replaced] | ok
core | intf.parse and agnt.read write their trace rows | [traced] | ok
answer | alpha launched is current, the older Next: lines are replaced | 6 current, 2 replaced [statuses] | ok
chips: Prompt | Reading | Read | Answer
```

## dozentimes-core: the contract

The contract is two records. [src: dozentimes-core/contract.ts:1]
intf produces a TemporalIntent, agnt consumes it and returns LedgerFacts, and dates are ISO calendar dates with no time zone. [src: dozentimes-core/contract.ts:1-2]

### TemporalIntent

Table intro: The intent carries seven fields. [src: dozentimes-core/contract.ts:18-27]

| Field      | Values                                        | What it carries                               |
| ---------- | --------------------------------------------- | --------------------------------------------- |
| asof_mode  | current, past, range, future, mixed, none     | Which time the answer is about.               |
| anchor     | start, end and the words it came from, or     | The date or span. A point has start equal to  |
|            | null                                          | end.                                          |
| basis      | stated, inherited, default                    | Said in this question, carried from earlier,  |
|            |                                               | or now.                                       |
| kinds      | a subset of the twelve kinds of time          | Which kinds the question needs.               |
| confidence | 0 to 1                                        | From Jev, or 0.6 on the rules.                |
| path       | jev, fallback, manual                         | Who made the reading, so a silent Jev failure |
|            |                                               | shows.                                        |
| query      | the question with its time phrases removed    | The text used for retrieval.                  |

### LedgerFact

Table intro: A fact carries four clocks and three freshness fields. [src: dozentimes-core/contract.ts:35-50]

| Group     | Fields                                        | Meaning                                        |
| --------- | --------------------------------------------- | ---------------------------------------------- |
| Identity  | id, project, section, text, source_path       | One bullet or entry, where it lives.           |
| Class     | kind                                          | Volatility class: identity, preference,        |
|           |                                               | decision or status.                            |
| Clocks    | valid_at, invalid_at, recorded_at, source_at  | True from, true until, learned on, file date.  |
| Freshness | last_verified_at, verified_by,                | Last confirmed, by whom, last read.            |
|           | last_accessed_at                              |                                                |
| Read view | status                                        | current, replaced, needs_check or              |
|           |                                               | current_then, set at read time.                |

### Statuses and shelf lives

| Status       | Meaning                                                      |
| ------------ | ------------------------------------------------------------ |
| current      | Still true as far as the source shows.                       |
| replaced     | A newer line or a re-read closed it. Never shown as current. |
| needs_check  | Past its shelf life and not confirmed by a re-read.          |
| current_then | True at the past date or span the question asks about.       |

Shelf lives are hand-set per class: status 7 days, decision 90, preference 365, identity never. [src: dozentimes-core/contract.ts:52-56]
A ponytail comment in the contract marks them for fitting from verification outcomes. [src: dozentimes-core/contract.ts:53]

### SQLite schema

The SQLite schema has five tables in one file, opened in WAL mode at ~/.dozentimes/ledger.db unless DOZENTIMES_DB names another. [src: dozentimes-core/db.ts:6-7]

Table intro: The schema is five tables. [src: dozentimes-core/db.ts:9-56]

| Table     | Holds                                                                         |
| --------- | ----------------------------------------------------------------------------- |
| facts     | One row per fact, unique on source path, section and text.                    |
| facts_fts | FTS5 index over project, section and text, filled by an insert trigger.       |
| checks    | One row per re-read: the fact, its age in days, whether it changed, and why.  |
| sources   | One row per source file: its hash and when it was last ingested.              |
| traces    | One row per tool call: tool, input, output, path, milliseconds and any error. |

### Traces, clock and the Jev client

Traces clip each input and output to 2,000 characters, and the newest rows feed /dozentimes and the trace command line. [src: dozentimes-core/trace.ts:12-20]
DOZENTIMES_NOW pins the clock, which is how tests, the replay and the end-to-end suite set dates. [src: dozentimes-core/dates.ts:20-21]

The Jev client is one fetch to the TypeSafe System One endpoint, with the model pinned to jev-1.13.0 unless DOZENTIMES_JEV_MODEL says otherwise. [src: dozentimes-core/jev.ts:4-5]
It is on only when TYPESAFE_API_KEY is set and DOZENTIMES_JEV is not off, and it throws on any failure instead of guessing, because every caller has a fallback. [src: dozentimes-core/jev.ts:15-22]
Jev answers two question types: a choice among labels with a confidence, and a yes-or-no probability. [src: docs/research/jev-api.md:22-58]

## dozentimes-intf: temporal intent

### Candidates in code, judgments by Jev

Code finds the candidates and does every date sum, and Jev only picks labels. [src: dozentimes-intf/intent.ts:2]
chrono-node finds date phrases against the session clock. [src: dozentimes-intf/intent.ts:22-26]
Code then turns "last week" or "next month" into Monday-to-Sunday weeks or whole months, widens a bare month to its full span, and merges "between X and Y" into one range. [src: dozentimes-intf/intent.ts:27-51]

The rules pick the mode from the candidate and a few word lists. [src: dozentimes-intf/intent.ts:78-95]
A stated date in the future, or a future word, reads as future.
"Since" or "what changed" reads as mixed.
A span reads as range, and a single date as past.
With no date, a now word reads as current, then a held as-of is inherited, then a future word reads as future.
Anything else is none.

When Jev is on, one batched call asks up to four questions: which mode, whether the question is about now, which candidate phrase sets the time, and, when an as-of is held, whether this question changes the period. [src: dozentimes-intf/intent.ts#jevAnswers]
A choice counts only at confidence 0.5 or more, and a yes only at probability 0.5 or more. [src: dozentimes-intf/intent.ts#jevLayer]
Jev never writes a date.
It picks one of the candidates code found, or none. [src: dozentimes-intf/intent.ts#jevLayer]
On any Jev error the rule reading stands and the error is stored on the intent and in the trace row. [src: dozentimes-intf/intent.ts#parseIntent]

### Ambient as-of

The ambient as-of is the period a conversation is in. [src: dozentimes-core/contract.ts:30-33]
A stated past date, span or since-question sets it. [src: dozentimes-intf/intent.ts:105]
A follow-up with no date inherits it. [src: dozentimes-intf/intent.ts:90-93]
A new stated period replaces it. [src: dozentimes-intf/intent.ts:105]
A current reading clears it: on the rules that takes "now", "currently" or "today", and on the Jev path Jev's own now judgment.
A Jev yes to "does this change the period" also clears it, and /dozentimes asof sets or clears it by hand. [src: dozentimes-intf/intent.ts:106] [src: pi-time/agent/extensions/dozentimes/index.ts:205-209]

### Guards and Jev's now judgment

Live Jev failures shaped how Jev and the rules combine. [src: whats_next.md:56-59]
An inherited reading is kept: Jev's mode choice alone cannot drop it, and only the "does this change the period" judgment can.
Live Jev had read the follow-up "And the next step for alpha?" as future, because of the word "next". [src: dozentimes-intf/intent.ts#derive] [src: whats_next.md:45]
A second guard once let an explicit now word override Jev's mode, after live Jev read "What is the next step for alpha now?" as future. [src: whats_next.md:56]
The probe then showed that guard threw away three of Jev's right answers, such as "Was that still true at the time?", which has "still" and is about the past. [src: whats_next.md:58] [src: dozentimes-intf/intent.ts#derive]
Since commit e9ef5f7, on the Jev path "is this about right now?" is Jev's own judgment, and the keywords decide only on the fallback path. [src: dozentimes-intf/intent.ts#derive]
Jev still reads "next step" as future at 0.9 confidence while its own now judgment says now at 0.8, and the combination follows the now judgment. [src: whats_next.md:59]

Figure 2 title: Ambient as-of across a four-turn conversation

Figure 2 caption: The asof kinds test, replayed.
Turn 1 states a date and sets the as-of, turn 2 inherits it, turn 3 states a new period and replaces it, and turn 4 asks about now and clears it.
The diamonds are the inherit guard and the now judgment, and the dotted line back to the start is the hand reset with /dozentimes asof clear. [src: test/kinds/asof.test.ts:24-39]

Figure 2 alt text: Five as-of states in a row, no as-of, set to 2026-10-14, inherited 2026-10-14, replaced by September 2026, and cleared, with the transition rule on each line, the inherit guard, and the now judgment on the clear step. [src: test/kinds/asof.test.ts:24-39]

```
Figure 2 strings
stations: no as-of, ambient is null | set, 2026-10-14, stated past | inherited, 2026-10-14, follow-up with no date | replaced, 2026-09-01..2026-09-30, stated range | cleared, ambient is null | guard, Jev's mode cannot drop it | now judgment, Jev's on the Jev path, a now word on the rules
pills: stated past date | no date | new stated period | now word | /dozentimes asof clear
legend: as-of state | guard
log:
turn 1 | "As of Oct 14, what was the plan for orchard?" | stated past [set] | ok
turn 2 | "and the next step for orchard?" | no date, inherited [kept] | ok
guard | Jev's mode choice alone cannot drop an inherited reading | [kept] | ok
turn 3 | "and in September, what was the plan for orchard?" | stated range [replaced] | run
turn 4 | "what is the orchard plan now?" | now word, current [cleared] | ok
now | on the Jev path Jev's own now judgment decides, on the rules a now word does | [current] | ok
chips: Set | Inherit | Replace | Clear
```

## dozentimes-agnt: the freshness ledger

### Sources, extraction and dating

Sources are whats_next.md, HANDOFF.md, docs/handoffs/*.md and learning_guide*.html under ~/create and ~/repos, at most four folders deep, skipping dot folders and node_modules. [src: dozentimes-agnt/ledger.ts:231-248]
DOZENTIMES_ROOTS replaces the two roots. [src: README.md:23]

Markdown extraction takes each bullet or checkbox line of 12 characters or more outside code fences, under its nearest heading. [src: dozentimes-agnt/ledger.ts:56-90]
Learning guides give one fact per definition term and per first table cell, under their section heading. [src: dozentimes-agnt/ledger.ts:34-53]
A fact's project is the folder that holds its file, or the repo root for docs/handoffs. [src: dozentimes-agnt/ledger.ts:24-28]

Dating follows the nearest date the author wrote. [src: docs/plans/2026-10-22.pi-time-poc.md:51]
In markdown that is the nearest dated heading, then a date prefix on the filename, then the file's modified date. [src: dozentimes-agnt/ledger.ts:59-86]
In a learning guide it is the section heading's date, then the last date in the title, then the modified date. [src: dozentimes-agnt/ledger.ts:34-41]
At ingest, last_verified_at is the author's date and verified_by is author, because reading a line is not checking it. [src: dozentimes-agnt/ledger.ts:166-168]
Jev classifies each new line into a volatility class in batches of 40, and a keyword rule takes over on error. [src: dozentimes-agnt/ledger.ts:106-133]

### Replacement rules

Four replacement rules close a fact at ingest. [src: dozentimes-agnt/ledger.ts:172-203]

Table intro: The rules carry these letters in the code. [src: dozentimes-agnt/ledger.ts:172] [src: dozentimes-agnt/ledger.ts:179] [src: dozentimes-agnt/ledger.ts:188] [src: dozentimes-agnt/ledger.ts:201]

| Rule | Closes                            | When                                | Closed at                 |
| ---- | --------------------------------- | ----------------------------------- | ------------------------- |
| (a)  | An open checkbox                  | The same text appears checked in    | The checked line's date   |
|      |                                   | the same file.                      |                           |
| (b)  | A Next: line                      | Its successor in the project: the   | The successor's date      |
|      |                                   | next later-dated one, or the next   |                           |
|      |                                   | one lower in the same file on the   |                           |
|      |                                   | same day.                           |                           |
| (c)  | Any line                          | It is gone from its file on         | The day it was found gone |
|      |                                   | re-read.                            |                           |
| (d)  | A state-like section of a handoff | A later-dated handoff of the same   | The later handoff's date  |
|      |                                   | project has the same section        |                           |
|      |                                   | (State, Next step, Recent artifacts |                           |
|      |                                   | and similar).                       |                           |

A removed line that comes back is reopened, and the gap between removal and return is not kept. [src: dozentimes-agnt/ledger.ts:156-162]

### Verification, reads and maintain

Verification is a re-read of the source file. [src: dozentimes-agnt/ledger.ts:332-350]
If the file's hash changed since the last ingest, the file is re-ingested first so the replacement rules run.
The fact is verified when its line is still there and no rule closed it: last_verified_at moves to today and verified_by to source.
Otherwise it is closed today.
Every re-read writes a checks row with the fact's age and whether it changed, which is the data shelf-life fitting needs. [src: dozentimes-agnt/ledger.ts:344-346]

Each read takes a text-match pool five times the limit, then prefers live facts and newer ones. [src: dozentimes-agnt/ledger.ts:292-297]
The status depends on the mode. [src: dozentimes-agnt/ledger.ts:273-320]

Table intro: Three read shapes cover the six modes. [src: dozentimes-agnt/ledger.ts:283-305]

| Mode                  | Facts returned               | Status                       | Re-reads             |
| --------------------- | ---------------------------- | ---------------------------- | -------------------- |
| current, none, future | All matches                  | replaced if closed,          | needs_check facts    |
|                       |                              | needs_check if past shelf    |                      |
|                       |                              | life, else current           |                      |
| past, range           | Valid on or before the       | current_then                 | None                 |
|                       | anchor's end and not closed  |                              |                      |
|                       | before its start             |                              |                      |
| mixed                 | The past set at the anchor,  | current_then for the past    | The newer facts only |
|                       | plus live facts dated after  | set, current rules for the   |                      |
|                       | it                           | rest                         |                      |

When a re-read catches a change, the read runs once more without re-reading, so facts the re-ingest added can answer. [src: dozentimes-agnt/ledger.ts:316-317]
Maintain re-checks stale live facts up to a budget, most recently read first, then the longest unconfirmed. [src: dozentimes-agnt/ledger.ts:352-366]

Figure 3 title: One fact from ingest to replacement

Figure 3 caption: The fixture fact "Next: alpha needs a load test before launch", written in the 2026-10-06 session and ingested on 2026-10-13. [src: test/fixtures/ablation/edits.json]
By 2026-10-22 it is past the 7-day status shelf life, the re-read finds a 2026-10-15 session appended, rule (b) closes it at its successor's date, and a past read as of 2026-10-14 still returns it as current_then. [src: test/fixtures/ablation/edits.json] [src: test/fixtures/ablation/questions.json]
The verified branch is dotted because this fact changed. [src: test/fixtures/ablation/alpha/whats_next.md:11-12] [src: test/fixtures/ablation/edits.json]

Figure 3 alt text: A fact moves from ingest to current, to needs_check after its shelf life, to a source re-read, and then to replaced.
A dotted branch shows the verified path back to current, and a past read shows the same fact as current_then.

```
Figure 3 strings
stations: ingest, 2026-10-13, valid 2026-10-06 | current, verified by author 2026-10-06 | needs_check, 16 days, status shelf life 7 | re-read source, hash changed, re-ingest | verified, verified_by source, clock reset | replaced, closed 2026-10-15 by rule (b) | current_then, past read as of 2026-10-14
pills: shelf life passes | line present | successor found
legend: code step | state
log:
ingest | alpha/whats_next.md read on 2026-10-13, author date 2026-10-06 | [current] | ok
clock | 2026-10-22, 16 days since the author wrote it | [needs_check] | run
agnt | a now question re-reads the source, its hash changed | [re-ingest] | run
rule (b) | the 2026-10-15 Next: is its successor | closed 2026-10-15 [replaced] | back
read | as of 2026-10-14 it was valid and not yet closed | [current_then] | ok
chips: Ingest | Stale | Re-read | Past read
```

## pi-time

### Launcher and agent directory

The launcher sets PI_CODING_AGENT_DIR to pi-time/agent, so pi-time keeps its own settings, sessions and extension apart from the user's pi. [src: pi-time/pi-time:5-7]
It links auth.json and fd from ~/.pi/agent instead of copying them, installs chrono-node if it is missing, and starts pi with --no-skills so shared skills stay out. [src: pi-time/pi-time:9-21]
The agent settings pin provider zai, model glm-5.3 and project trust never. [src: pi-time/agent/settings.json]

### Tools, per-turn reading and status line

Table intro: Four tools reach the model. [src: pi-time/agent/extensions/dozentimes/index.ts:121-185]

| Tool            | Does                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------- |
| dozentimes_ask  | Runs the pair: the turn's reading, the ledger read and the re-checks, a status per fact. |
| temporal_intent | Reads the time reference only, and updates the held as-of like a turn.                   |
| ledger_query    | Reads the ledger with an explicit mode and anchor, to override the reading.              |
| ledger_verify   | Re-reads one fact's source and returns its status before and after.                      |

Before each turn a hook parses the prompt, adds the reading and three rules to the system prompt, and updates the status line. [src: pi-time/agent/extensions/dozentimes/index.ts:187-196] [src: pi-time/agent/extensions/dozentimes/index.ts:259-270]
The rules are to call dozentimes_ask for project questions, say the reading back in one line, and never present a replaced or needs_check fact as current.
The status line reads "dt <facts> facts | <stale> stale | reading: as of 2026-10-14 (inherited from earlier) | jev ok", and the last field turns to "jev FALLBACK n" after any Jev error in the session. [src: pi-time/agent/extensions/dozentimes/index.ts:96-105]
/dozentimes shows counts by status and class, the held as-of, the top projects, the last 10 traces and the remaining work. [src: pi-time/agent/extensions/dozentimes/index.ts:213-224]
Its subcommands are ingest, maintain, asof and trace. [src: pi-time/agent/extensions/dozentimes/index.ts:198-226]

### Startup and remaining work

On startup pi-time builds the ledger if it is empty, or re-ingests only the files whose hash changed, then lists remaining work. [src: pi-time/agent/extensions/dozentimes/index.ts:56-68] [src: pi-time/agent/extensions/dozentimes/index.ts:240-257]
The list is the open GitHub issues, needs-input first, then agent:todo, then a count of ideas, with REMAINING.md as the offline fallback. [src: pi-time/agent/extensions/dozentimes/index.ts:70-91]

### Observability and privacy

Every Jev failure is loud. [src: learning_guide.html]
The trace row keeps the error, the status line counts fallbacks, /dozentimes trace marks the row ERROR, and the answer still arrives on the rules. [src: pi-time/agent/extensions/dozentimes/index.ts:198-203]
A test hook, DOZENTIMES_TRACE_FILE, writes each turn's reading and each dozentimes_ask result as one JSON line. [src: pi-time/agent/extensions/dozentimes/index.ts:45-48]
Without a terminal UI the extension also writes to stderr, and inside the UI it never does, because stderr lines tear the pi screen. [src: learning_guide.html]

The repo is public. [src: README.md:84]
The ledger lives outside it, and sessions, the auth link, the fd link, model store and trust file are gitignored. [src: .gitignore]
Fixtures are synthetic, replay reports hold counts and rates only, and issue bodies name engineering work, not corpus content. [src: docs/plans/2026-10-22.pi-time-poc.md:93-98] [src: test/replay/README.md:19-22]

### On the real corpus

On today's corpus a build with keyword classes finds 70 source files, 13 of them learning guides, and 1,914 facts, of which 49 are replaced and 278 are past their shelf life. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:125]
Keyword classes label most lines decision, so a build with Jev classes, as pi-time runs it, finds more status facts and more stale ones. [src: test/replay/README.md:13-14]

## Tests

Six layers each answer a different question. [src: README.md:42-56]

Table intro: Latest results by layer, with the run each came from below. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:5-11] [src: docs/content/dozentimes-design/runs-2026-10-22.txt:83-87] [src: docs/content/dozentimes-design/runs-2026-10-22.txt:113-117]

| Layer           | Command             | Proves               | Cannot prove         | Latest result        |
| --------------- | ------------------- | -------------------- | -------------------- | -------------------- |
| Unit            | npm test            | Extraction, dating,  | That the rules match | 22 pass (intf 9,     |
|                 |                     | the four rules,      | how people write or  | agnt 13)             |
|                 |                     | statuses, verify,    | ask.                 |                      |
|                 |                     | maintain, the intent |                      |                      |
|                 |                     | rules and fallback.  |                      |                      |
| Ablation        | node                | The mechanism: what  | A rate on real data. | both 100% right      |
|                 | test/ablation.ts    | each tool adds, and  | Seven questions,     | status, 0 harm, 2    |
|                 |                     | that the pair        | three synthetic      | assertions pass      |
|                 |                     | removes all harm on  | projects.            |                      |
|                 |                     | the script.          |                      |                      |
| Twelve kinds    | npm run kinds       | Which kinds of time  | That a passing kind  | 25 pass, 11 todo, 0  |
|                 |                     | are built, by a      | works on real docs.  | fail, plus 2         |
|                 |                     | method per kind over |                      | generator tests      |
|                 |                     | generated git        |                      |                      |
|                 |                     | histories.           |                      |                      |
| Replay from git | npm run replay --   | Dating and past      | Over-reach by rule   | recall 0.998,        |
|                 | --jev               | reads against git    | (d), and anything    | precision 1.0        |
|                 |                     | truth on real        | about questions.     | without backdated    |
|                 |                     | history, and how     |                      | lines                |
|                 |                     | well shelf lives     |                      |                      |
|                 |                     | predict change.      |                      |                      |
| End to end      | npm run e2e --      | Real pi and glm-5.3  | Behavior beyond      | 14 of 14 turns over  |
|                 | --runs 2            | call the tools, read | seven scripted       | 2 runs, fallback 7   |
|                 |                     | each turn right, and | turns, or a stable   | of 7 answered        |
|                 |                     | answer without harm. | pass rate from 2     |                      |
|                 |                     |                      | runs.                |                      |
| Jev probe       | npm run probe       | Jev is not echoing   | Accuracy. The 21     | traps: rules 0 of    |
|                 |                     | the rules, because   | questions are        | 10, Jev 9, combined  |
|                 |                     | Jev never sees the   | contrived against    | 9                    |
|                 |                     | rules' answer, and   | the rules by design. |                      |
|                 |                     | where the            |                      |                      |
|                 |                     | combination loses    |                      |                      |
|                 |                     | what Jev had right.  |                      |                      |

### Where each number comes from

- npm test runs the unit, ablation and twelve-kinds tests offline: 62 tests, 51 pass, 0 fail and 11 todo, with Jev forced off in every test file. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:5-11]
  whats_next.md records 50 pass and 12 todo. [src: whats_next.md:54]
  The count moved because commit 5c375b9 dropped a todo marker on a test that had passed since the successor fix. [src: whats_next.md:54]
- Unit, ablation, kinds, score and probe numbers were re-run on 2026-10-22 at 01:23 at commit e9ef5f7. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:2]
- The end-to-end numbers come from $TMPDIR/dozentimes-e2e/2026-10-22T05-19-13-262Z, whose results were written at 01:23, and the fallback numbers from the 04-55-19-266Z-fallback run, written at 00:56. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:129-130]
  The commit note for e9ef5f7 records the end-to-end result as unchanged after that commit's change to how Jev and the rules combine. [src: whats_next.md:58]
- The fallback run and the replay came before e9ef5f7. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:130] [src: docs/content/dozentimes-design/runs-2026-10-22.txt:133]
  The replay exercises only the ledger, which that commit did not touch.
  The replay numbers come from ~/.dozentimes/replay/2026-10-22/report.md, a 133-second run with Jev classes. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:133]

### Coverage matrix

Table intro: Each kind's claim, from the test plan, with today's counts. [src: docs/plans/2026-10-22.test-suites.md:22-35] [src: docs/content/dozentimes-design/runs-2026-10-22.txt:13-26]

| Kind         | Claim                                 | Pass | Todo | What the todo waits on                |
| ------------ | ------------------------------------- | ---- | ---- | ------------------------------------- |
| event        | A period question returns facts dated | 1    | 1    | In-text event dates                   |
|              | in it                                 |      |      |                                       |
| valid        | A replaced fact answers the past, not | 4    | 1    | #7                                    |
|              | now                                   |      |      |                                       |
| record       | The ledger knows when it learned a    | 2    | 1    | Record-time as-of                     |
|              | fact                                  |      |      |                                       |
| source       | An old doc imported today does not    | 1    | 1    | Git dates                             |
|              | look new                              |      |      |                                       |
| reference    | Relative phrases resolve to the right | 5    | 1    | Relative phrases inside docs          |
|              | date                                  |      |      |                                       |
| sequence     | A later same-day write wins           | 1    | 1    | Same-day handoffs never replace (#12) |
| verification | Only the author or a re-read confirms | 3    | 1    | #3                                    |
| access       | Recently used stale facts are checked | 1    | 0    | -                                     |
|              | first                                 |      |      |                                       |
| volatility   | Shelf life follows the class          | 3    | 1    | #4                                    |
| intended     | A future commitment is captured       | 1    | 1    | #8                                    |
| business     | Fiscal periods map to dates           | 2    | 2    | #9                                    |
| asof         | A stated date carries until changed   | 1    | 0    | -                                     |

A todo is a real assertion that fails today and flips when the feature lands. [src: test/kinds/METHODS.md:5]

### Ablation

The ablation runs with the intent rules and the ledger carried through the script, and again cold with a fresh ledger per question.

Table intro: Ablation totals over the seven questions.
Found is the share of gold facts returned, and harm counts harmful facts shown as true. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:40-49] [src: docs/content/dozentimes-design/runs-2026-10-22.txt:65-74] [src: docs/plans/2026-10-22.pi-time-poc.md:61-68]

| Setup       | What runs     | Found | Right status | Harm | Re-reads carried | Re-reads cold | Caught cold |
| ----------- | ------------- | ----- | ------------ | ---- | ---------------- | ------------- | ----------- |
| none        | Text search,  | 79%   | 36%          | 4    | 0                | 0             | 0           |
|             | read as now,  |       |              |      |                  |               |             |
|             | no checks     |       |              |      |                  |               |             |
| intf        | Intent        | 79%   | 79%          | 2    | 0                | 0             | 0           |
|             | reading,      |       |              |      |                  |               |             |
|             | plain store,  |       |              |      |                  |               |             |
|             | no freshness  |       |              |      |                  |               |             |
| agnt        | Full ledger,  | 86%   | 57%          | 4    | 4                | 24            | 11          |
|             | every         |       |              |      |                  |               |             |
|             | question read |       |              |      |                  |               |             |
|             | as now        |       |              |      |                  |               |             |
| both        | Intent        | 100%  | 100%         | 0    | 4                | 9             | 4           |
|             | reading and   |       |              |      |                  |               |             |
|             | the full      |       |              |      |                  |               |             |
|             | ledger        |       |              |      |                  |               |             |
| interaction | -             | +0.14 | 0.00         | -2   | -                | -             | -           |

Harm is the count of harmful facts shown as current or current_then, so the interaction 0 - 2 - 4 + 4 = -2 means the pair removes 2 more than the two tools remove separately. [src: test/ablation.ts:24-31]
The ledger alone removes no harm because it re-checks, finds the newest fact, and then shows it as true for questions about the past. [src: README.md:74]
Found facts show a positive interaction too, +0.14: only a re-read finds the two facts appended after ingest (q1 and q5), and only an as-of read returns the fact that was current on Oct 1 (q2). [src: docs/content/dozentimes-design/runs-2026-10-22.txt:47] [src: test/fixtures/ablation/questions.json]
On the carried script one early now question pays for the re-reads later questions use, so both setups spend 4.
The cold run is the fair comparison. [src: learning_guide.html]

### Intent score, replay and end to end

The intent score is a regression check: the rules get 20 of 20 and Jev 19 of 20 on asof_mode, both 20 of 20 on anchor and basis, at 2 ms and 112 ms per question. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:78-81]
The labels were written next to the rules, so it does not measure accuracy. [src: whats_next.md:48]

The replay on real history scores the ledger against git, not against its own rules. [src: test/replay/README.md:51-52]
Over 50 sources and 143 sample dates, recall against git truth is 0.998 and precision is 1.0 once 345 backdated lines are set aside. 22 lines were misdated. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:134-143]
The freshness check over 479 version pairs shows the 7-day status shelf life flags 4,672 facts of which 14% changed, about 7 flagged for each real change, and it catches 61% of status changes. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:146-147]
The share of status facts changed rises with age: 7% at 0 to 7 days, 12% at 8 to 30, and 35% at 31 to 90. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:151]
No fact in the sample is older than 90 days, so the decision and preference shelf lives never fire. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:147-154]

The end-to-end suite drives real pi with glm-5.3 through the seven questions as one conversation and checks the tool call, the reading, the facts and three Jev-judged checks per turn. [src: test/e2e/README.md:1-25]
The latest run passed 14 of 14 turns over 2 runs at about $0.06 per run as pi reports cost. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:129]
With a bad Jev key all 7 turns still answered, and 8 of 8 trace rows recorded the error. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:130]

The Jev probe scores the rules alone, Jev's raw mode choice alone, and the combination on 21 contrived questions. [src: dozentimes-intf/probe.ts:1-3]
On the 10 traps worded to fool the keyword rules, the rules get 0, Jev alone 9 and the combination 9. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:114]
All three get the 6 controls right. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:116]
On the 3 questions with no time in them the rules get 3 and Jev 2, because Jev read "What color is the alpha logo?" as current. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:117] [src: docs/content/dozentimes-design/runs-2026-10-22.txt:122]
On the 2 questions about a past with no date, such as "What did we believe before the launch?", Jev gets both and the combination neither, because the contract has no way to say "past" without an anchor date. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:115] [src: docs/content/dozentimes-design/runs-2026-10-22.txt:119-121]
That gap is filed as #13. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:160]

## Progress

Built on this branch and checked by the suites in Section 06: the contract, both tools, the pi-time launcher and extension, the ablation, and three test suites, with remaining work filed as issues. [src: whats_next.md:30-35] [src: whats_next.md:54-56]
Each defect below was found by running the system.

Table intro: Defects found and fixed, in the order they were found. [src: learning_guide.html] [src: whats_next.md:42-58]

| #  | Defect                          | Found by                         | Fix                              |
| -- | ------------------------------- | -------------------------------- | -------------------------------- |
| 1  | Every fact read as verified     | First interactive run, in a      | last_verified_at at ingest is    |
|    | today, so the status line       | herdr pane                       | the author's date                |
|    | showed 0 stale                  |                                  |                                  |
| 2  | No real fact was ever replaced, | First build on the real corpus   | Rule (d) and same-day Next:      |
|    | because real handoffs use       |                                  | lines                            |
|    | section headings                |                                  |                                  |
| 3  | Text ranking answered a         | A question on the real corpus    | A 5x text-match pool, then live  |
|    | "current state" question from   |                                  | and newer facts first            |
|    | an older handoff                |                                  |                                  |
| 4  | Shared skills loaded with parse | First launch                     | --no-skills, and links to the    |
|    | warnings, and pi downloaded fd  |                                  | user's auth.json and fd          |
|    | into the repo                   |                                  |                                  |
| 5  | Stderr lines tore the pi screen | Herdr side pane run              | Stderr only when there is no UI  |
| 6  | Jev dropped an inherited as-of  | Jev ablation                     | Guard: only the change-of-period |
|    | on a follow-up                  |                                  | judgment drops it                |
| 7  | One ingest of three Next: lines | Kinds suite, valid               | Each closes at its successor's   |
|    | closed all of them at the       |                                  | date                             |
|    | newest date                     |                                  |                                  |
| 8  | A removed line that came back   | Replay suite                     | Reopen it                        |
|    | stayed closed                   |                                  |                                  |
| 9  | Jev read "next step ... now" as | End-to-end suite                 | Guard: an explicit now word      |
|    | future                          |                                  | wins, replaced by row 13         |
| 10 | The judge failed right          | End-to-end suite                 | Ask "true for the asked time",   |
|    | historical answers that         |                                  | not "currently true"             |
|    | mentioned the present           |                                  |                                  |
| 11 | The first replay counted rule   | Reading the first replay report  | A separate bucket for rule       |
|    | replacements of present lines   |                                  | claims                           |
|    | as misses                       |                                  |                                  |
| 12 | A todo marker stayed on a test  | Writing this page                | Marker dropped in commit 5c375b9 |
|    | that passes                     |                                  |                                  |
| 13 | The now-word guard threw away   | Jev probe                        | On the Jev path, Jev's own now   |
|    | three of Jev's right answers    |                                  | judgment decides                 |

Three counts behind these rows were recorded in the learning guide and not re-run here: 0 of 809 facts stale before the verification fix and 342 after, 0 of 809 replaced before rule (d) and 48 after, and 1,998 replay misses from the closed re-added lines. [src: learning_guide.html]
One more issue was handled without a code defect: a ledger with the real corpus appeared in the home folder during the worker runs, its cause untraced, and it was deleted so the first real run stays a first run. [src: learning_guide.html]

## What's next

Seven issues are open for agents or for you, and five more are parked ideas. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:159-172]
The order below puts first what changes another issue's measurement.

Table intro: The open issues in the order that unblocks most. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:140] [src: docs/content/dozentimes-design/runs-2026-10-22.txt:159-172]

| Order    | Issue | What it does                | Why it goes here            | Gate                       |
| -------- | ----- | --------------------------- | --------------------------- | -------------------------- |
| You, now | #1    | About 50 intent questions   | The only issue that needs   | node                       |
|          |       | written blind by you        | you. It decides whether Jev | dozentimes-intf/score.ts   |
|          |       |                             | stays on the intent path,   |                            |
|          |       |                             | and nothing else waits on   |                            |
|          |       |                             | it.                         |                            |
| 1        | #12   | Scope rule (d) to handoffs  | Rule (d) supersedes 6,416   | npm run replay -- --jev,   |
|          |       | of the same unit, and break | line-dates in the replay,   | kinds sequence todo flips  |
|          |       | same-day ties               | more than any other rule,   |                            |
|          |       |                             | so it moves every           |                            |
|          |       |                             | replacement count           |                            |
|          |       |                             | downstream.                 |                            |
| 2        | #7    | Replace other status        | Same replacement code as    | Kinds valid todo flips,    |
|          |       | bullets beyond Next: lines  | #12, so the rules change    | replay                     |
|          |       | and sections                | once and are measured once. |                            |
| 3        | #6    | Match reworded facts        | A reworded bullet reads as  | npm test, replay           |
|          |       |                             | replaced plus new, which    |                            |
|          |       |                             | loses its verification      |                            |
|          |       |                             | history and counts as a     |                            |
|          |       |                             | change in the freshness     |                            |
|          |       |                             | data.                       |                            |
| 4        | #5    | Classify re-ingested facts  | Facts added during a        | npm test, ledger counts by |
|          |       | with Jev                    | re-read get keyword         | class path                 |
|          |       |                             | classes, and shelf lives    |                            |
|          |       |                             | are fitted per class.       |                            |
| 5        | #4    | Fit shelf lives from the    | Needs the rules, fact       | Kinds volatility todo      |
|          |       | checks table                | identity and classes above  | flips, replay              |
|          |       |                             | to be stable first. The     |                            |
|          |       |                             | data is already on the      |                            |
|          |       |                             | issue.                      |                            |
| 6        | #3    | Record verifications and    | Independent. It adds        | Kinds verification todo    |
|          |       | replacements stated in chat | verified_by user as a new   | flips, npm run e2e         |
|          |       |                             | kind of check.              |                            |

The recommendation is a fresh session that takes this queue one issue at a time, with npm test at 0 fail before each commit, the replay re-run after #12, #7, #6 and #4, and npm run e2e -- --runs 2 once at the end. [src: whats_next.md:53]
A todo that flips becomes a plain assertion in the same commit, so the suites tighten as the work lands.

## What's after

Beyond the open queue, each item is a decision with a cost on each side. [src: REMAINING.md]

Table intro: Decisions after the open queue. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:78-81] [src: docs/content/dozentimes-design/runs-2026-10-22.txt:151] [src: docs/content/dozentimes-design/runs-2026-10-22.txt:113-117]

| Decision                | Choice            | For                | Against            | Decide when        |
| ----------------------- | ----------------- | ------------------ | ------------------ | ------------------ |
| Store adapters (#10)    | Put Graphiti or   | Entity resolution  | Another service,   | The ledger needs   |
|                         | Mem0 behind the   | and scale without  | and each engine    | sharing across     |
|                         | contract          | changing intf      | has its own idea   | agents or outgrows |
|                         |                   |                    | of current that    | SQLite             |
|                         |                   |                    | must map to four   |                    |
|                         |                   |                    | statuses           |                    |
| qmd retrieval (#11)     | Let qmd supply    | Could find         | A second index to  | Replay or e2e show |
|                         | the candidates    | reworded matches   | keep in step, and  | retrieval misses,  |
|                         |                   | that token-OR text | a ranking blend to | not dating misses  |
|                         |                   | match misses       | tune               |                    |
| Shelf-life curves       | Fit change by     | The replay shows   | The data is        | #4 has run and the |
|                         | age, not one      | change rising with | handoff files only | checks table has   |
|                         | cut-off           | age, which a       | and correlated     | months of rows     |
|                         |                   | single cut-off     | within a source,   |                    |
|                         |                   | ignores            | so a curve may fit |                    |
|                         |                   |                    | habits, not truth  |                    |
| Intended time (#8)      | Schedule what the | Closes the one     | Needs a scheduler  | A real reminder    |
|                         | reading parses    | kind that is       | and a way to fire  | use case appears   |
|                         |                   | parsed and then    | inside pi. The     |                    |
|                         |                   | dropped            | research rates     |                    |
|                         |                   |                    | schedulers as      |                    |
|                         |                   |                    | available and the  |                    |
|                         |                   |                    | link to memory as  |                    |
|                         |                   |                    | the gap            |                    |
| Fiscal calendars (#9)   | Map FY phrases to | "FY26" and "Q3     | A per-organization | Questions about    |
|                         | dates             | FY26" get anchors  | setting to keep    | fiscal periods     |
|                         |                   | instead of only a  | correct            | show up            |
|                         |                   | kind tag           |                    |                    |
| Past with no date (#13) | Resolve "before   | Jev already reads  | A new anchor kind  | Blind questions in |
|                         | the launch" to    | these as past, so  | in the contract,   | #1 show how often  |
|                         | the date of a     | the reading would  | and an event match | people ask this    |
|                         | ledger fact, or   | follow             | that can pick the  | way                |
|                         | ask for a date    |                    | wrong fact         |                    |
| Jev on intent           | Keep Jev on the   | On the probe's 10  | No gain on the     | After the blind    |
|                         | intent path       | traps Jev reads 9  | labeled sets, one  | set in #1          |
|                         |                   | and the rules none | guard still        |                    |
|                         |                   |                    | needed, a known    |                    |
|                         |                   |                    | "next step"        |                    |
|                         |                   |                    | weakness, and 112  |                    |
|                         |                   |                    | ms against 2 ms    |                    |
|                         |                   |                    | per question       |                    |

Jev's value on intent is the open question with the most riding on it. [src: whats_next.md:57-59]
On the labeled sets its reading adds nothing over the rules, and on the contrived traps it reads 9 of 10 that the rules miss. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:114]
Neither set was written blind, so #1 decides it. [src: whats_next.md:57]
Classification is a different use: Jev labels each line's volatility, and keyword classes put almost everything into decision. [src: test/replay/README.md:13-14]

## Risks and limits

- The ablation and end-to-end suites run on synthetic fixtures: seven questions over three projects, two edits behind the ledger. [src: README.md:60-62]
  They show the mechanism, not a rate.
- The 20 intent labels were written next to the rules, and the ablation gold was written with its fixtures for this test, so passing either is a regression check. [src: whats_next.md:48] [src: README.md:77]
- The replay samples are thin: 50 sources, 143 sample dates and 479 version pairs, correlated within each source, with no confidence intervals and no fact older than 90 days. [src: test/replay/README.md:59-61] [src: docs/content/dozentimes-design/runs-2026-10-22.txt:135-146]
- The replay's rule (d) over-reach check is inconclusive: it flags all 1,842 cases, because the filename test passes whenever two handoffs have different names and cannot tell a new unit of work from the same unit renamed. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:144-145] [src: test/replay/README.md:63]
- Two end-to-end runs do not give a stable pass rate, and the suite's own notes name three sources of judge and model noise. [src: test/e2e/README.md:56-61]
- The fallback end-to-end run predates commit e9ef5f7, which also reordered the rules so that a held as-of now wins over a future word. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:130] [src: dozentimes-intf/intent.ts#derive]
- The 7-day status shelf life is costly on real history: it flags 4,672 facts of which 14% changed, about 7 re-reads for each change it finds. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:147]
- Project text leaves the machine: ingest sends each new line to Jev, TypeSafe's hosted API, in batches of 40 for classification, and pi-time sends questions and ledger facts to the zai model. [src: dozentimes-agnt/ledger.ts:106-133] [src: pi-time/agent/settings.json]
  DOZENTIMES_JEV=off keeps classification and intent reading on the local rules, and the model calls remain. [src: dozentimes-core/jev.ts:15-16]
- The probe is contrived against the rules by design, so its scores show that Jev is not echoing the rules and say nothing about accuracy. [src: test/fixtures/intent-probe.json]

Footer: Built 2026-10-22 from the repo at commit e9ef5f7. [src: docs/content/dozentimes-design/runs-2026-10-22.txt:2]
Numbers carry their run in Section 06, and the command outputs are in docs/content/dozentimes-design/runs-2026-10-22.txt. [src: n/a - section reference and file path, not a statistic]
