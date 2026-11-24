---
name: outcome-first
description: Use in Founder Control Room tasks to define the useful outcome, bound delegation, choose risk-proportionate proof, and stop when enough has been demonstrated without weakening founder authority.
version: 1.0.0
scope: founder-control-room
---

# Outcome-First — Founder Control Room

## Order and precedence

Outcome → Authority → Constraints → Acceptance → Discretion → Action → Evidence → Stop.

This is a *decision order*, not a replacement for `AGENTS.md`, `GLOBAL_AI.md`, the founder intelligence constitution, `founder-control-room-operator`, repository-specific contracts, or the existing required 5W1H, preflight, review and release gates. Stricter privacy and approval rules always win. A skill cannot act as a machine-enforced gate or new approval source.

## Five-field contract

For material work establish, succinctly and from authorized evidence:

1. **Outcome:** What observable deliverable or behavior must exist?
2. **Authority:** Exactly what repository, branch, sources, environments, and action classes are permitted?
3. **Constraints:** What work, private data, interfaces and contracts must remain untouched?
4. **Acceptance:** What fresh, exact-subject evidence would suffice?
5. **Discretion:** What bounded, reversible implementation choices can be made without more approvals?

Do not ask redundant questions when narrow safe assumptions suffice. Do ask when missing authority, safety facts or a binding product decision materially changes the result.

## Permission boundaries

- Never access, search, copy, or share unrelated private files, accounts, repositories, or user/provider data. Available connector access is not authorization.
- Authorization for inspection, branch creation, scoped edits, review, merge, deployment, provider writes, credentials, spending, publication, and deletion are **different** classes. Do not infer one from another.
- Preserve user-owned work and history; do not delete or overwrite unrelated changes.
- A draft is not applied; a staged object is not a branch change; a commit is not a merge; CI does not prove production runtime or human outcomes.
- If mandatory FCR evidence is FAIL or UNKNOWN, stop unrelated implementation and advancement. Only separately authorized, scoped diagnosis or isolated candidate remediation may continue. Record the next exact gate.
- A tool, skill, PR title, historical receipt, model consensus, or founder silence cannot grant approval.

## Proportional decision rule

| Change | Expected approach |
| --- | --- |
| Reversible isolated draft | Choose narrow assumptions; deliver a useful artifact and check it minimally. |
| Authorized branch-only code/docs | Inspect relevant current target and constraints; make smallest coherent patch; run focused checks plus required exact-head gates. |
| Irreversible, cross-project, sensitive or production operation | Require explicit exact approval and strong relevant fresh evidence before acting. |

Evaluate the cost of **inaction** alongside risk, but never trade away a hard authority or safety boundary for speed. Prefer a thinner safe slice over a broad speculative system.

## Execute, verify, stop

1. Attack the premise and choose the smallest useful reversible slice.
2. Implement only inside the approved target; keep source, CI, deployment, runtime, and outcome evidence separate.
3. Attribute findings as **AUTHORED**, **OBSERVED**, **USER-REPORTED**, **VERIFIED**, **INFERRED**, or **UNKNOWN**. Record work status separately: **DRAFTED**, **APPLIED**, **PASSED**, **FAILED**, **BLOCKED**, **SKIPPED**.
4. **Stop rule:** When the outcome is delivered, named acceptance criteria have supporting evidence at the correct scope, and no material blocker remains, hand off. Do not invent more requirements.
5. If the next gate remains unknown or unapproved, deliver the bounded result and explicitly name that gate; never claim aggregate pass.

## Handoff

Lead with what was delivered and where. Then state exact branch/head, checks actually observed, preserved work, material limitations, rollback, and NEXT GATE; retain the FCR-required 5W1H / proof format when applicable. Never invent logs, SHAs, receipts or results.
