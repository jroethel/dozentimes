# dozentimes

Two time tools for agent memory that share one contract, and a pi environment that uses both.

| Path               | What it is                                                                        |
| ------------------ | --------------------------------------------------------------------------------- |
| `dozentimes-core/` | The shared contract (`TemporalIntent`, `LedgerFact`), SQLite, traces, Jev client. |
| `dozentimes-intf/` | Temporal intent: a question plus conversation state becomes a typed time reading. |
| `dozentimes-agnt/` | Freshness ledger: dated facts with volatility, verification and status.           |
| `pi-time/`         | pi with both tools, in its own agent dir.                                         |
| `test/`            | Unit tests and the ablation test that shows what the pair adds.                   |

The design comes from the October 2026 memory-systems research, "Two tools, one contract".

## Run it

```sh
./pi-time/pi-time
```

The first run builds the ledger at `~/.dozentimes/ledger.db` from `whats_next.md`, `HANDOFF.md`, `docs/handoffs/*.md` and `learning_guide*.html` under `~/create` and `~/repos`.
It then lists the remaining work.
Set `DOZENTIMES_ROOTS` (colon-separated) to scan other folders, and `DOZENTIMES_DB` to use another ledger file.

To run pi-time from any branch, whatever this checkout has out, install the branch launcher once:

```sh
install -m 755 pi-time/pi-time-branch ~/.local/bin/pi-time
pi-time                            # main, with the real ledger
pi-time --branch feat/some-branch  # a branch under test, with its own ledger
```

Each branch runs from a detached worktree under `~/.dozentimes/worktrees/`, moved to the branch tip on every launch, so only committed code runs.
A branch other than main gets its own ledger under `~/.dozentimes/branches/`, so testing it cannot change `~/.dozentimes/ledger.db`.
Set `DOZENTIMES_HOME` if the repo is not at `~/create/dozentimes`.

Inside pi-time:

- Every prompt gets a time reading, such as "answering as of 2026-10-14 (inherited from earlier)", shown in the status line.
- `dozentimes_ask` runs the pair: intent first, then the ledger reads at that time and re-checks stale facts against their source files.
- `temporal_intent`, `ledger_query` and `ledger_verify` run each side alone.
- `ledger_record` records what you say about a fact: that it still holds, or that it changed, with the new value when you give one.
- `/dozentimes` shows ledger counts, the last traces and remaining work. `/dozentimes ingest`, `/dozentimes maintain 10`, `/dozentimes asof 2026-10-14`, `/dozentimes asof clear` and `/dozentimes trace 20` do what they say.

Outside pi:

```sh
node dozentimes-intf/cli.ts "As of Oct 14, what was the plan?" "and for beta?"
node dozentimes-agnt/cli.ts summary
node dozentimes-agnt/cli.ts trace 20
```

## Test

```sh
npm test                      # unit tests and the ablation, offline
node test/ablation.ts         # the ablation table
node test/ablation.ts --cold  # same, with a fresh ledger per question
node test/ablation.ts --jev   # intent read by Jev instead of the rules
node dozentimes-intf/score.ts  # rules against Jev on 20 labeled questions
npm run kinds                 # coverage matrix for the twelve kinds of time
npm run replay -- --jev       # replay real doc history from git (results in ~/.dozentimes/replay/)
npm run e2e -- --runs 2       # real pi + glm-5.3 through the seven-question chat, judged by Jev
npm run probe                 # contrived questions that fool the rules: is Jev doing anything?
npm run e2e -- --fallback     # same with a bad Jev key: answers must still arrive
```

`npm test` runs the unit tests, the ablation and the twelve-kinds suite offline.
Kinds tests for behavior not built yet are real assertions marked todo with their issue number.
The replay and e2e suites call live services and are run by hand.

## What the ablation shows

The script has seven questions about three synthetic projects.
Two source files were edited after the ledger last read them.
Four configurations answer it: no tools, intent only, ledger only, both.

| Config | Right status | Wrong facts shown as true | Re-reads, cold |
| ------ | ------------ | ------------------------- | -------------- |
| none   | 36%          | 4                         | 0              |
| intf   | 79%          | 2                         | 0              |
| agnt   | 57%          | 4                         | 24             |
| both   | 100%         | 0                         | 9              |

On status accuracy the two tools add up.
Intent fixes the historical questions and the ledger fixes the current ones.
On harm they do more than add up.
The ledger alone removes no harm, because re-checking finds the newest fact and then shows it as true for questions about the past.
Intent tells the ledger which time each question is about, so both together show nothing false as true and spend well under half the re-reads.

These are synthetic fixtures written for this test, so they show the mechanism, not a measured rate on real data.

On the real corpus (69 files on 2026-10-22) the first build takes about 13 seconds and yields about 1,870 facts, classified by Jev.
About 48 are replaced by later lines and about 670 are past their shelf life, so a "now" question re-checks those before using them.

## Privacy

The repo is public.
The ledger, pi-time sessions and the auth link stay out of git (see `.gitignore`).
Test fixtures are synthetic.
