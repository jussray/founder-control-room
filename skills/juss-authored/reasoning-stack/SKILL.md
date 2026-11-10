---
name: reasoning-stack
description: Decision stack behind ULTRATHINK: OODA, Socratic falsification, MoSCoW, 80/20, Lindy twin, Redteam twin, L99, 5W1H, and language/tool discipline.
license: Proprietary — Juss / jussray
metadata:
  version: v1
  owner: Juss
  parent: juss-os
---

# ULTRATHINK reasoning stack

These are decision lenses, not ceremonial steps. Activate only the lenses that can change the next action.

## OODA

**Observe:** collect the narrowest authoritative evidence.  
**Orient:** map 5W1H, authority, runtime boundary, dependencies, and constraints.  
**Decide:** choose one reversible action with a stop condition.  
**Act:** execute once.  
**Verify:** compare observed result to the predicted result; loop only with new evidence.

## Socratic falsification

For the leading hypothesis ask: What would have to be true? What evidence would falsify it? What am I assuming because wording looks familiar? What stronger explanation fits the same facts? What evidence would change the decision? Prefer questions that can terminate a branch.

## MoSCoW

Apply to implementation scope, not truth labels: **MUST** to satisfy the user goal and safety/proof gate; **SHOULD** for high-value reliability with bounded cost; **COULD** for optional compounding value; **WON'T NOW** for unrelated refactors and speculative polish.

## 80/20

Find the smallest 20% of evidence/actions that can resolve roughly 80% of the decision. Never use 80/20 to skip a required safety, authority, or real-path gate.

## Lindy twin

**Lindy I:** will this design still make sense after vendors/models/tools change? Favor protocols, typed boundaries, simple data, reversible state, and provider independence.  
**Lindy II:** which existing behavior has survived because it is useful, and what regression risk comes from replacing it?

## Redteam twin

**Redteam I, existence:** should this change exist at all? Test user value, authority, privacy, cost, lock-in, complexity, and simpler alternatives.  
**Redteam II, failure:** assume the chosen fix ships. How does it fail under stale state, retries, partial success, permissions, provider drift, concurrent writers, bad inputs, and rollback?

## L99

Audit **authority · state · evidence · rollback · compounding value**. A change with no owner, no bound state, weak proof, or no rollback cannot score as complete.

## 5W1H

**WHO** remains UNKNOWN until attribution is proven. Keep prospective authority separate from forensic attribution. Then establish WHAT changed, WHERE the authoritative source/runtime lives, WHEN state was observed, WHY it matters, and HOW it is tested/reversed.

## Language/runtime discipline

Use Python for evidence tooling, deterministic validation, receipts, data transforms, and test harnesses. Use JavaScript/TypeScript for product/runtime code when the target project calls for it. Language choice never overrides the target repo's architecture.

## Order

Default: founder value → Observe → Runtime/5W1H → Socratic falsification → Redteam I → MoSCoW/80-20 → Decide → Act → Redteam II → Verify → Lindy/L99 → receipt.
