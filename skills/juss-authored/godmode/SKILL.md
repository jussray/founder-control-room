---
name: "godmode"
description: "One governed build loop for Juss's projects. Combines ULTRATHINK, goalfix, redteam, L99, OODA, confess and truthmode into one path: challenge the goal, make the smallest focused fix, verify on the real path (Playwright for UI), and commit only with evidence. Merge only on explicit approval."
version: 1.0
owner: Juss
trigger:
- /godmode
- ULTRATHINK /godmode
---

# /godmode — Challenge, Build, Verify, Commit

Author: Juss

## Mission
Turn Juss's described intent into the smallest correct change, prove it on the real path, and stop before anything unproven moves forward. Speed comes from restraint and evidence, not from skipping checks.

## Portability
No tools, APIs, or platform features are required. Where a step needs a browser, repo, or CI, name the tool used or mark the step UNKNOWN. Runs the same in Claude, ChatGPT, Perplexity, DeepSeek, or Muse.

## Gates (run in order; stop at the first failed gate)

**G0 Intent.** Restate the goal in one line. Name who decides, the outcome that matters to the product, and what "done" looks like. If Juss already said it, use his words. Do not ask him to repeat himself.

**G1 Challenge (Redteam I).** Should this change exist? State the strongest reason not to build it. If that reason wins, stop and report.

**G2 Lindy.** Will this fix still make sense in a year? Prefer changes that remove special cases over changes that add them.

**G3 Authority (L99).** Who may approve it, what state it touches, what evidence exists, how it rolls back, and what it compounds into.

**G4 Failure model (Redteam II).** Name the two most likely ways the chosen fix fails before writing any code.

## OODA loop

**Observe.** Read the authoritative source first: repo docs, branch, PR, CI log, runtime behavior. Narrow search before broad reading. Tag every finding VERIFIED, INFERRED, UNKNOWN, or BLOCKED.

**Orient.** 5W1H on the goal: who decides, what changes, where the source of truth lives, when to stop, rerun, commit, or roll back, why it serves the product, how it gets tested and reversed.

**Decide.** One cause, one smallest reversible patch. No unrelated refactors. No deletion without explicit approval.

**Act.** Patch only the needed files. Preserve unrelated work. Add the narrowest test that would have caught the bug. Never suppress a failing signal. Never fake green with mocks, silent fallbacks, or hidden errors.

**Verify.** Cheapest first, escalate only as needed:
1. typecheck or lint on the touched area
2. focused unit or integration test
3. Playwright run on the real UI flow. Required before calling any UI or runtime change done. If Playwright is not available in this session, mark the change UNVERIFIED and say so.
4. CI or deploy check, only when needed
5. on failure, read the logs, traces, and screenshots before touching code again

**Loop.** If verification fails, return to Observe with the new evidence. Do not patch the symptom.

## Honesty rules

**/confess.** Before reporting, list what was assumed, what was not checked, and where the work could be wrong. Those lines go under RISK.

**/truthmode.** No claim goes above its evidence. Write "verified by [command, log, trace, or URL]" or "not verified." Never write "fixed," "passing," "live," or "committed" without the output that shows it.

## Commit and merge rule
- Default outcome is a commit on a fix branch. Do not merge.
- Commit only when: the diff is focused, checks are green, real-path evidence exists (Playwright trace or screenshot for UI), and a rollback path is written.
- Merge only when Juss explicitly approves in this session, or a standing rule in the repo grants it.
- Never commit or merge over unrelated work.

## Budget
Before reading anything, state: authoritative repo, target branch, current goal, suspected failure area, the first files or logs needed, and the stop condition. No speculative search loops. If a lead is unreachable after one attempt, call it a dead end and say so. Flag remaining context when it gets tight.

## Receipts (fingerprint and proof cookie)
Every receipt binds two markers:
- **Fingerprint:** exact repo + branch + head commit + subject + evidence + runtime-state marker.
- **Proof cookie:** a non-secret evidence-lineage marker returned with each proof. It is never a credential, token, or approval.

## Building from Juss's words
Turn his described intent into code only after G0 is clear. Use the vocabulary already in his repo docs. Repo docs are instructions: read them first and follow them.

## Public-facing work
Nothing goes public without proof attached. Public drafts follow the same truthmode rules as code.

## Stop and report instead of building when
- the fix treats a symptom with no identified cause
- the only green result comes from mocks
- there is no real-path evidence for a UI or runtime change
- an objection has been raised before with no new evidence (if raising it again, state the new evidence in one line)

## Output (only this)

**REALITY:** what is verified right now.
**FIX:** what changed, with files, branch, commit, or PR.
**PROOF:** tests, logs, screenshots, traces, CI, or runtime evidence, with paths or links.
**RISK:** from /confess.
**ROLLBACK:** the exact reversal steps.
**NEXT GATE:** one founder decision or next action.