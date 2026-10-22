# whats_next - freshtime pi-time POC

Started 2026-10-21 on branch `feat/pi-time-poc`.
Goal: a working pi-time proof of concept with two tools, `freshtime-intf` (temporal intent) and `freshtime-agnt` (freshness ledger), sharing `freshtime-core`, plus an isolated pi environment `pi-time` that uses both.

## Decisions from Jeremy (2026-10-21)
- Repo stays public (jroethel/freshtime).
- Push the feature branch and file remaining work as `agent:todo` issues without asking. No merge to main.
- Demo data: his real project docs under ~/create and ~/repos (learning guides, whats_next.md, handoffs).
- Jev live with deterministic fallback, pi-time model zai glm-5.3.

## Guardrail that follows from "public repo" + "real docs"
- No extracted personal facts, ledger databases, or copied doc text enter git.
- The ledger DB lives in `~/.freshtime/` (outside the repo).
- Test fixtures are synthetic files that imitate the real formats.

## Working definition of 1+1=3
An ablation test over four configurations: none, intf only, agnt only, both.
Score each question for correct facts with the correct status label.
Success means both beats each single tool, and the interaction term is positive:
score(both) - score(none) > (score(intf) - score(none)) + (score(agnt) - score(none)).
Secondary metric: verification actions spent (both should spend fewer, on the facts that matter).

## Stack (proposed)
- TypeScript on Node 26 (type stripping), one language because pi extensions are TS and load in-process.
- `node:sqlite` (built in) for the ledger and traces, FTS5 for text retrieval.
- chrono-node for date phrases, Jev over fetch for judgments.
- `node --test` for tests.

## Status
- [x] Research notes in docs/research/ (Jev API, pi extensions), corpus survey.
- [x] core, intf, agnt, ablation test, pi-time extension. `npm test` 20/20.
- [x] Ablation (fallback and Jev paths): both 100% right status and 0 harm. Status gains add (interaction 0), harm falls superadditively (interaction -2), cold re-reads 8 vs 18.
- [x] Interactive E2E in a herdr pane on a throwaway ledger: past as-of, inherited follow-up, now question with 7 re-checks, /freshtime and /freshtime trace.
- [x] Remaining work filed as GitHub issues #1-#11. pi-time lists them at startup.
- Next: Jeremy runs `./pi-time/pi-time` for the first real ledger build (~/.freshtime/ledger.db does not exist yet, so the first run builds it, about 8 seconds).

## Judgment calls (reversible)
- One language (TypeScript on Node 26), because pi extensions run in-process. No Python or Rust.
- SQLite FTS5 for retrieval instead of qmd (issue #11).
- Learning guides not ingested yet (issue #2). Sources are whats_next.md, HANDOFF.md, docs/handoffs/*.md.
- last_verified_at at ingest is the date the author wrote the line, not the ingest date. Otherwise every first build reads as all fresh.
- Jev's as-of choice cannot override an inherited reading unless Jev also says the question changes the period. Live Jev otherwise read "And the next step for alpha?" as future.
- The ablation reports a cold mode (fresh ledger per question) for re-read spend, because in the carried script one early "now" question pays for later checks.
- The launcher passes `--no-skills`, so shared ~/.agents skills stay out of pi-time. It symlinks auth.json and fd from ~/.pi/agent, both gitignored.
- The 20-question intent score (rules 20/20, Jev 19/20) is a regression check, not accuracy, because the labels were written next to the rules (issue #1).
