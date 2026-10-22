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
- [x] Ablation (fallback and Jev paths): both 100% right status and 0 harm. Status gains add (interaction 0), harm falls superadditively (interaction -2), cold re-reads 9 vs 24.
- [x] Interactive E2E in a herdr pane on a throwaway ledger: past as-of, inherited follow-up, now question with 7 re-checks, /freshtime and /freshtime trace.
- [x] Remaining work filed as GitHub issues #1-#11. pi-time lists them at startup.
- Next: Jeremy runs `./pi-time/pi-time` for the first real ledger build (~/.freshtime/ledger.db does not exist yet, so the first run builds it, about 13 seconds).

## Judgment calls (reversible)
- One language (TypeScript on Node 26), because pi extensions run in-process. No Python or Rust.
- SQLite FTS5 for retrieval instead of qmd (issue #11).
- Learning guides are ingested: each <dt> and first table cell is a fact, dated by its h2 date or the title's last date (closed #2).
- Replacement now also covers same-day Next: lines in one file and state-like sections (State, Next step, Recent artifacts) of a later handoff. Before this, 0 of 809 real facts were ever replaced.
- Retrieval takes a text-match pool of 5x the limit, then prefers live and newer facts.
- last_verified_at at ingest is the date the author wrote the line, not the ingest date. Otherwise every first build reads as all fresh.
- Jev's as-of choice cannot override an inherited reading unless Jev also says the question changes the period. Live Jev otherwise read "And the next step for alpha?" as future.
- The ablation reports a cold mode (fresh ledger per question) for re-read spend, because in the carried script one early "now" question pays for later checks.
- The launcher passes `--no-skills`, so shared ~/.agents skills stay out of pi-time. It symlinks auth.json and fd from ~/.pi/agent, both gitignored.
- The 20-question intent score (rules 20/20, Jev 19/20) is a regression check, not accuracy, because the labels were written next to the rules (issue #1).

## 2026-10-22 test suites (in progress)
- Asked: a pi-time end-to-end suite, a real-data replay from git, and a test method with data and generators for each of the twelve kinds.
- Plan: docs/plans/2026-10-22.test-suites.md. Three workers build test/kinds/, test/replay/ and test/e2e/ in parallel.
- Recommendation given: the six open issues go to a fresh session after the suites land, gated by them.
- [x] Kinds suite: 50 pass, 12 todo, 0 fail (`npm run kinds`). Found two defects: batch ingest closed every Next: at the newest date (fixed, chain to successor), same-day handoffs never replace (#12).
- [x] Replay suite: against git, recall 0.998 and precision 1.0 excluding backdated lines. Status 7-day shelf life flags about 7 facts per real change (posted on #4). Rule (d) supersedes 6416 line-dates, over-reach unknown (#12). Re-added lines stayed invalid (fixed, reopen).
- [x] E2E suite: 14/14 turns over 2 runs after two fixes: explicit "now" words beat Jev's mode (Jev read "next step ... now" as future), and the judge asks "true for the asked time" instead of "currently true".
- Observation: on every labeled set so far, Jev's intent reading adds nothing over the rules and needed two guards. Its value is untested until the blind set (#1).
- [x] Jev probe (`npm run probe`, 21 contrived questions): traps worded to fool the rules score rules 0/10, Jev alone 9/10. The keyword "now" guard had thrown away three of Jev's right answers (combined 6/10). Changed: on the Jev path, "about right now?" is Jev's own judgment, not a keyword. Combined is now 9/10. score.ts, ablation --jev and e2e 14/14 unchanged.
- Known Jev weakness: it reads "next step" as future at 0.9 confidence while its own now judgment says now (0.8). The combine uses the now judgment.
- Contract gap: a past with no date ("before the launch", "back when we used Postgres") has no anchor, so it reads as now. Filed.
- [x] Design explanation: docs/design/freshtime-design/ (HTML and 16-page PDF, elucid-flow), content master and claims ledger in docs/content/freshtime-design/. Known layout gap: PDF page 2 is mostly empty because Fig 1 is kept whole.
- [x] Fallback path regression from the Jev combine change fixed ("Will the importer ship?" after a stated as-of read as inherited instead of future). Fallback e2e 7/7.
- Next: the open issues (#3 to #7, #12, #13 idea) in a fresh session, gated by npm test, npm run probe, npm run e2e and npm run replay. #1 waits on Jeremy's blind questions.
