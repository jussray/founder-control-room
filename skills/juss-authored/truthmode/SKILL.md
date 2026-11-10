---
name: truthmode
description: Evidence-bound truth baseline for claims, contradictions, drift, and runtime attribution. Use when /truthmode is invoked or when a decision depends on proving what is actually true.
license: Proprietary — Juss / jussray
metadata:
  version: v1
  owner: Juss
  parent: juss-os
---

# /truthmode

`/truthmode` is a verifier, not a confidence style. It converts claims into evidence-bound labels and refuses to turn missing evidence into certainty.

## Contract

1. Extract atomic claims. One claim must be falsifiable without proving every neighboring sentence.
2. Name the strongest reachable authority for each claim before grading it.
3. Preserve exact request and exact observed response when runtime behavior is involved.
4. Apply Runtime First-Class attribution: identify the **last execution boundary proven to have received the request** and the **first forward transition that cannot be proven**.
5. Keep forensic **WHO = UNKNOWN** until the actor that produced the outcome is directly proven. HTTP status, provider code, message text, branding, or customer-visible wording are never sufficient attribution by themselves.
6. Compare runtime, deployment, branch@SHA, bound artifacts, receipts, docs, chat, and inference. Surface contradictions instead of selecting the convenient source.
7. Other-model output is a claim source only. Never inherit its `VERIFIED` label.
8. Grade each claim with the Juss OS labels: `VERIFIED · INFERRED · PARTIAL · UNKNOWN · BLOCKED · STALE · DISPROVEN`.
9. For every non-VERIFIED claim, name the smallest closure evidence that could change the decision.
10. Stop when the decision can be made or the next evidence source is blocked.

## Runtime First-Class record

```text
REQUEST: <exact immutable request>
OBSERVED RESPONSE: <exact immutable response>
LAST PROVEN RECEIVER: <boundary + evidence>
FIRST UNPROVEN FORWARD TRANSITION: <boundary>
WHO PRODUCED OUTCOME: <actor | UNKNOWN>
AUTHORITY STATUS: <AUTHORIZED | UNAUTHORIZED | UNKNOWN>  # separate from attribution
```

Attribution and authority are orthogonal. A runtime actor may be PROVEN while authority remains UNAUTHORIZED or UNKNOWN.

## Output

```text
TRUTH BASELINE
<claim-id> <LABEL> — <claim>
  PROOF: <source / locator>
  CONTRADICTION: <none | exact conflict>
  CLOSURE: <none | smallest evidence needed>

RUNTIME BOUNDARY
  request · response · last proven receiver · first unproven transition · WHO

DECISION
  what the evidence permits now; otherwise UNKNOWN/BLOCKED
```

## Executable path

```bash
python3 .claude/skills/juss-os/scripts/ultrathink.py truthmode --input truth.json
```

Input is JSON with `claims`, optional `contradictions`, and optional `runtime`. See tests in `scripts/test_modes.py` for the binding schema.
