# Regression & Stagnation Guard — Claude Skill File
> Load into Claude.ai Projects as a Knowledge Base file. Or reference from CLAUDE.md in Claude Code.

## When to Use
Before committing/deploying any code change. When a project feels stuck. When you've tried the same fix more than twice.

## Regression Checklist (Before Every Commit)
1. **Before/After State:** What worked before? Does it still work after this change? Test each item.
2. **Acceptance Criteria:** Was there a specific outcome defined? Is it achieved and verifiable?
3. **Side Effects:** Did this touch shared/utilities files? Could it break imports elsewhere? Did config change?
4. **Dependency Integrity:** Run `npm ls` / `pip list` / equivalent — any errors? Lockfiles unchanged?
5. **Smoke Test:** Does the app start? Does the primary user flow complete? New console errors?

## Stuck-Loop Detector
| Pattern | Signal | Action |
|---------|--------|--------|
| Same error 2+ times | Fixing symptoms, not cause | Stop. Re-read error. Search for root cause. |
| Rewriting same code 3+ times | Design is wrong | Step back. Draw the data flow. Start fresh. |
| No commits in 30+ min | Gold-plating or stuck | Commit what works. Move on. |
| Cycling between approaches | Decision paralysis | Pick the simplest. Ship it. Improve later. |
| Adding more code to fix bugs | Complexity spiral | Delete code. Simplify. Re-test. |

## Stagnation Recovery Protocol
1. Stop coding. Write what you know and what you don't know.
2. State the actual problem in one sentence. Not the symptom. The problem.
3. Identify the smallest possible next step that produces a testable result.
4. If you can't find it: the problem is too big. Break it down further.
5. If you can't break it down: you lack information. Research first.
6. If research doesn't help: ask the user. A 30-second human answer beats 2 hours of guessing.

## Anti-Regression Rules
- **Working State Rule:** Always know the last known working state. Commit after every successful test.
- **One Change Rule:** Make one change at a time. Test after each.
- **Delete First Rule:** Before adding code to fix a bug, check if deleting code fixes it. Simpler > complex.

## Returning to a Stalled Project
1. Read the TODO ledger
2. Check `git log --oneline -10`
3. Run existing tests — all passing?
4. Identify what was in progress when you stopped
5. Identify what blocked you
6. Decide: continue or pivot. Write the decision to the TODO ledger.
