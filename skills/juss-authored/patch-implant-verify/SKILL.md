---
name: "patch-implant-verify"
description: "Token-efficient patch application + verification using runtime-kernel v2 proof discipline. Apply external patches via git am, verify with Playwright/CI, report REALITY/FIX/PROOF/RISK without speculation."
---

# Patch Implant & Verify (v1)

**Purpose:** Apply external patches to target repo (git am), verify against actual state, report proof or blockers. Minimize token burn; maintain rigor.

## Pre-flight (1 check)
- Target repo accessible? If no → BLOCKED, stop.
- Patch source identified (file/commit range)? If no → UNKNOWN, stop.

## Apply (1 action)
```bash
git am < patch-file
# or: git format-patch BASE..HEAD → git am
```
If conflict: resolve narrowly, commit as-is, note conflict in RISK.

## Verify (2 steps, narrowest path)
1. **CI proof only**: Does the target repo CI pass for this exact commit?
   - If yes → PROOF exists
   - If no → FAILED, investigate one line in CI logs only
2. **Runtime proof only if load-bearing** (UI/API change, credential, deploy)
   - Playwright: one test covering the changed path
   - If green → VERIFIED
   - If red → FAILED + one screenshot

## Report (REALITY/FIX/PROOF/RISK)
- **REALITY**: What patches applied, what's now on HEAD
- **FIX**: git am commit SHA, files changed (diff stat only, no full diff)
- **PROOF**: CI exit code + commit SHA, OR Playwright test result + trace (not both unless load-bearing)
- **RISK**: Merge conflicts resolved? Provider mutations needed? Authority/auth new? (one line each)

## Blockers (name them, stop)
- Repo auth gate → "BLOCKED: repo unreachable"
- Patch not found → "UNKNOWN: patch source"
- CI red (non-load-bearing) → "CANDIDATE: CI red, proceed with caution"
- Playwright red (load-bearing) → "FAILED: real-path proof missing"

## Next gate
One founder decision: merge/revert/investigate/wait.

---

**Token discipline:**
- No speculation loops (verify once per decision, stop on unknown)
- No full diffs (stat only)
- No retry without reason
- CI/Playwright only; skip if not load-bearing
- Report findings, don't interpret