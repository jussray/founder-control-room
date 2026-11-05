---
name: "founder-action-implant-verify"
description: "Execute one bounded founder-directed action on any repo or system, verify its effect, and report REALITY/FIX/PROOF/RISK/ROLLBACK/NEXT GATE with zero speculation loops."
---

# Founder Action Implant + Verify

**Purpose:** Execute one founder-approved action (patch, commit, deploy, config, provider change, etc.) on any repo, verify it worked, and report evidence with surgical precision.

## Pre-flight (30 seconds)

1. **What repo?** Exact GitHub repo or system (jussray/*, chief-ai, bip, vercel project, cloudflare, etc.)
2. **What action?** One bounded thing: apply a patch, merge a PR, deploy, run a command, update config, etc.
3. **Proof type:** What proves it worked? (CI pass, git commit, Playwright test, provider readback, log tail, etc.)
4. **Blocker check:** Can you reach the repo/system and execute the action right now? If not, name the blocker and stop.

## Execute (narrowest path)

### Patch + commit lane
- Pre-flight: repo access, patch validity (git apply --check)
- Apply: git am or git apply
- Verify: git log HEAD, stat output
- Stop on: conflicts, auth gate

### Direct repo change lane
- Pre-flight: branch, target files, git status clean
- Change: edit files, git add, git commit
- Verify: git diff HEAD~1, git log -1, file content
- Stop on: auth, status changes, merge conflicts

### Merge/PR lane
- Pre-flight: repo, PR number/SHA, required checks
- Merge: gh pr merge or GitHub API call
- Verify: branch status, main head, base unchanged
- Stop on: checks failing, merge conflict, permission denied

### CI/Playwright verification lane
- Pre-flight: test exists, can run locally or trigger
- Run: pytest, npm test, gh workflow run, or Playwright
- Verify: exit code, output, trace file
- Stop on: test timeout, permission, network

### Provider change lane (deploy, config, DNS, etc.)
- Pre-flight: access confirmed, target identified, change scope clear
- Execute: provider CLI or API call (vercel, cloudflare, gh, aws, etc.)
- Verify: provider readback (live config, deployment status, resource state)
- Stop on: auth error, invalid config, rate limit

## Report (REALITY format)

```
REALITY:
  action: [what changed: patch applied, PR merged, deploy triggered, etc.]
  repo: [exact repo or system]
  head_before: [git SHA or provider state before]
  head_after: [git SHA or provider state after]
  
FIX:
  files: [stat only: +lines/-lines per file, no full diffs]
  commits: [SHA + message if applicable]
  
PROOF:
  [pick ONE per action type]
  git proof: git log HEAD~N..HEAD, git show SHA, git diff
  CI proof: workflow run URL + exit code
  test proof: test name + pass/fail, Playwright trace URL
  provider proof: live config read, deployment status, curl response
  
RISK:
  [redteam the action]
  conflicts: [did patches/merges introduce conflicts?]
  auth new: [did you create new secrets, tokens, or auth gates?]
  provider mutations: [did state change unexpectedly?]
  rollback latency: [how long to revert?]
  
ROLLBACK:
  [exact reversal command or steps]
  git: git revert SHA / git reset --hard HEAD~1 / git push origin main
  provider: [exact undo steps or previous config]
  
NEXT GATE:
  [one founder decision or action]
  merge / review / wait / investigate / rollback
```

## Discipline

- **One action per invocation.** If multiple changes are needed, execute one, report, and wait for approval before the next.
- **No speculation loops.** Verify the path exists before spending context on it. If the path is unknown or blocked, name it and stop.
- **No full diffs.** Stat-only reporting (file names + line counts) unless diffs directly prove the claim.
- **Evidence only.** Report what you can prove. Mark unknown state clearly.
- **Stop on unknown.** UNKNOWN status for a repo, branch, or provider state = BLOCKED. Do not guess.
- **Zero token waste.** One pre-flight check, one execute, one verify. If the execute fails, diagnose once, then report the failure.

## Example: Patch apply

Pre-flight: jussray/founder-control-room, patch 0001-fix-sync.patch, CI proof
  → git clone / patch validity check / CI endpoint reachable ✓

Execute: git am patch < 0001-fix-sync.patch
  → HEAD: abc123 → def456

Verify: git log -1 --stat
  → sync.ts +5/-3, test_sync.spec.ts +3/-0
  → gh workflow run verify-patch → exit 0 ✓

Report:
  ```
  REALITY:
    action: patch applied + CI verified
    repo: jussray/founder-control-room
    head_before: abc123
    head_after: def456
    
  FIX:
    files: sync.ts +5/-3, test_sync.spec.ts +3/-0
    commits: def456 | fix: status-sync idempotent evidence
    
  PROOF:
    git proof: git log -1 --stat def456
    CI proof: workflow run XYZ exit 0, all checks ✓
    
  RISK:
    conflicts: none (clean apply)
    auth: none
    mutations: sync behavior now idempotent (intended)
    
  ROLLBACK:
    git reset --hard abc123 && git push origin main
    
  NEXT GATE:
    merge / wait for manual review / investigate test red
  ```

## Example: Deploy verify

Pre-flight: vercel project jussco.company, deploy HEAD, provider readback
  → project ID confirmed, main at SHA abc123, deploy API reachable ✓

Execute: vercel deploy --prod
  → deployment started, build in progress

Verify: curl https://jussco.company / check Vercel dashboard
  → new build deployed, no 5xx, old version artifact gone

Report:
  ```
  REALITY:
    action: production deploy completed
    repo: jussray/jussray main
    head_before: abc123 (previous deploy)
    head_after: def456 (current live)
    
  FIX:
    commits: def456 | feat: quotes + founder emails (merged PR #12)
    
  PROOF:
    provider proof: Vercel deployment XYZ, build success, live status green
    curl proof: https://jussco.company 200 OK, asset versions match def456
    
  RISK:
    conflicts: none
    auth: none
    mutations: DNS CNAME still points to previous Worker (expected)
    
  ROLLBACK:
    Vercel → Deployments → previous deployment → Promote to Production
    
  NEXT GATE:
    monitor / run snapshot test / wait for user feedback
  ```

## Stop conditions

**BLOCKED if:**
- Repo access denied (auth gate)
- Patch does not apply cleanly (merge conflict)
- Provider API unreachable
- Action scope is ambiguous (multiple repos, multiple PRs, unspecified deploy target)
- Proof path does not exist or is unreachable
- Founder authorization is not explicit (PERMIT phase not complete)

**Name the blocker plainly.** Do not speculate on how to unblock. Report and wait.