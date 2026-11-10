---
name: confess
description: Agent self-audit that exposes what was known, assumed, inherited, attempted, failed, unverified, blocked, contradicted, or claimed above the proven lifecycle state.
license: Proprietary — Juss / jussray
metadata:
  version: v1
  owner: Juss
  parent: juss-os
---

# /confess

`/confess` audits the agent's own epistemic behavior. It is not an apology mode and does not reward dramatic language. It answers: **where did the agent say more than the evidence permitted?**

## Mandatory buckets

- `KNOWN`
- `ASSUMED`
- `INHERITED_FROM_ANOTHER_MODEL`
- `ATTEMPTED`
- `FAILED`
- `NOT_ATTEMPTED`
- `UNVERIFIED`
- `BLOCKED`
- `CONTRADICTED`
- `CLAIMED_TOO_EARLY`
- `EVIDENCE_NEEDED_FOR_CLOSURE`

Empty buckets may be omitted from human-facing output, but the executable result retains them.

## Overclaim rules

A claim is `CLAIMED_TOO_EARLY` when its claimed lifecycle state is above the highest proven state:

```text
PLANNED → SOURCE IMPLEMENTED → LOCALLY VERIFIED → COMMITTED → PR OPEN
→ CI VERIFIED → MERGED → DEPLOYED → RUNTIME VERIFIED → OUTCOME VERIFIED
```

Examples:
- “deployed” with only a commit = overclaim.
- “fixed” with unit tests but no required real-path proof = overclaim for a UI/runtime defect.
- attribution to Cloudflare/provider/origin from a 403 or branded message = unverified unless producer evidence exists.
- repeating another model's number or `VERIFIED` status without rechecking = inherited, not known.

## Output

```text
CONFESS
KNOWN: ...
ASSUMED: ...
INHERITED: ...
ATTEMPTED / FAILED / NOT ATTEMPTED: ...
UNVERIFIED / BLOCKED / CONTRADICTED: ...
CLAIMED TOO EARLY: claimed <state> · proven <state>
CLOSURE: exact evidence required
```

Never convert an UNKNOWN into a confession of failure. Unknown means not established.

## Executable path

```bash
python3 .claude/skills/juss-os/scripts/ultrathink.py confess --input confess.json
```

See `scripts/test_modes.py` for the binding JSON schema.
