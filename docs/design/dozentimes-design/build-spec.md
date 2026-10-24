---
brand: elucid-flow
doctype: technical-brief
content: docs/content/dozentimes-design/content.md
slug: dozentimes-design
status: draft
built: 2026-10-22
---

# Build spec - dozentimes design explanation

## Intake

- Brand: elucid-flow, resolved in the user tier of the brand-pack inventory.
- Content input: docs/content/dozentimes-design/content.md, status draft.
  No approved content.md exists.
  The build ran on the delegated task's instruction to deliver the HTML and PDF in one pass, which this spec treats as the override, so the build carries no content-approval record.
- Doctype: technical-brief, from the content front matter.
- Altitude: mechanism level for the project owner, summary first (the verdict field), then the detail.
- Outputs: docs/design/dozentimes-design/dozentimes-design.html and docs/design/dozentimes-design/dozentimes-design.pdf.

## Clarifying answers

- Audience: the project owner, who wants the summary layer first.
- The repo is public: no text from the owner's project docs, no project names other than dozentimes, and only aggregate numbers from real-data runs.
- No claude.ai artifact. Outputs stay local and uncommitted, because the orchestrator commits.
- The replay and end-to-end suites were not re-run. Their numbers come from their newest result files, named in Section 06 of the page and in docs/content/dozentimes-design/runs-2026-10-22.txt.
- Mid-build change: commit e9ef5f7 replaced the keyword now guard with Jev's own now judgment and added the Jev probe. All synthetic commands were re-run at e9ef5f7, and the probe became a sixth test layer.

## Figure language

- Every flow is a replay (brand book section 04), each with one point.
  - Fig 1, one question through the four parts: the question's path from prompt to statuses, with Jev and the fallback inside dozentimes-intf and trace rows going to the ledger file.
  - Fig 2, ambient as-of across a four-turn conversation: the as-of states set, inherited, replaced and cleared, with the inherit guard and the now judgment.
  - Fig 3, one fact from ingest to replacement: current, needs_check, re-read, replaced, and current_then for a past read, with the verified branch dotted.
- Tables carry the contract, schema, rules, read modes, tools, test layers, coverage matrix, ablation, defects, the issue queue and the decisions. The recommended row is amber: the "both" setup and the first issue in the queue.
- Section numerals hang because the text cites sections by number. They are structural labels added at layout.
- Figure strings (stations, pills, legends, log lines) are drafted in the content's fenced figure blocks, and the build asserts that each one used in a spec appears there.

## Wish list

None. Every element used is in the brand book.

## Verification

- Content byte-identity: SHA-256 of content.md recorded before the review gates and compared after them (see the final line of this section).
- Provenance marker: the pack's default marker as an HTML comment, the first child of head.
- Delivery: one HTML file with the kit CSS as its one style block and the kit JS as its one script. The only external requests are the Google Fonts links, which the brand book requires. This conflicts with craft-build's "no external requests" gate, and the brand rule was followed. The PDF embeds the fonts.
- Kit deviations: CSS comments and JS comment lines are stripped, and the theme key in localStorage is renamed, so no non-dozentimes names or local paths ship in the public repo. Behavior is unchanged.
- `python3 kit/check-figures.py`: 0 issues at 1440px light, 1100px light, 390px light and 1440px dark.
- Screenshots read at 1440px light and dark and 390px light.
- PDF: rendered by Google Chrome 155 through Playwright with reduced motion, so each replay prints finished, at a 1180px page width so the 960px replays fit at full size, with print backgrounds. Every page was rasterized and read. 16 pages.
  The PDF render adds two print-only rules that are not in the HTML: no bottom padding on the frame, which removed a trailing blank page, and the hidden view switch's empty row is removed.
- Re-render 2026-10-24: the project was renamed from freshtime to dozentimes, and the HTML and PDF were renamed and re-rendered with the same settings, using Chrome's default 0.4in page margins. 16 pages, every page rasterized and read.
- House style: no em dash, no section sign, and no semicolons in rendered prose, checked on the HTML, the PDF text and the content files.
- Fresh-context verification (a separate agent with the brand book and the page): every mechanical rule passes.
  - Fixed: the period inside a code span after a path, and the Fig 1 log, whose first row was cut off in an earlier shot. The log height now fits all its steps.
  - Fig 2's guards floated below the track. They now connect to the transitions they guard.
  - Kept: PDF page 2 is mostly empty. Fig 1 is taller than the space left after the Section 01 text, and the brand keeps figures whole.
  - Kept: headings near page ends. The fix would need a print rule outside the kit CSS, so it is noted for the kit.
- Persona-seated review: architecture-reviewer, distributed tier of the installed persona plugin.
  - Accepted: a caption note that the replay log times are the replay's clock and not latency, a risk on project text sent to Jev and the zai model, a risk on the cost of the 7-day status shelf life, and "built and checked by the suites" in place of "built and verified".
  - Declined: moving the contract and schema tables to an appendix, cutting Fig 2, and a separate decisions block. The request fixed the sections and their contents, and Fig 2 is the state diagram it asked for.
  - Declined: rewording the verdict lead. It already states that accuracy adds and harm falls superadditively, in the paragraph under the lead.
- Content byte-identity: content.md was edited once after the reviews, through the content stage, and re-checked with check-content.py. Its SHA-256 f8054376b2b2d78d7d81acaeb99afe7b15131a34a5ee627de8f20792bb23783b was recorded before the final build and matched after it.

## Minimal path

Not taken. Both review gates ran.
