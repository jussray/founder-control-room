# Capital Control Architecture v1

Status: **DESIGN_ONLY**  
Authority repository: `jussray/founder-control-room`  
Runtime contract: `fcr/capital-control-architecture@v1`

## Reality

This repository carries a source-controlled capital-governance contract for the founder goal: support both portfolio-level and project-level investment without silently transferring product/runtime authority or surrendering founder control.

This is **not** a securities filing, charter, cap table, valuation, share authorization, legal opinion, live offering, or proof that a parent company or project subsidiary exists. Until executed external documents are independently verified, the parent entity, project-subsidiary map, share classes, cap table, valuation, and offering state remain `UNKNOWN` / `NOT_AUTHORIZED`.

Repository membership is not corporate ownership evidence.

The evaluator is **advisory only**. Its output never authorizes execution of a legal, securities, IP-transfer, or control-changing action. `executionAuthorized` is always `false`.

## 5W1H

**WHO**  
The founder remains the human authority for capital-governance decisions. Investors may receive economic and legally defined governance rights through future executed documents, but investment never grants repository, deployment, provider, credential, or product-execution authority.

**WHAT**  
Two distinct future investment lanes are modeled:

1. `portfolio` — investment in a future verified portfolio parent issuer, with economics limited to assets and subsidiaries that issuer is proven to own.
2. `project` — investment in a future verified project-specific issuer, with economics limited to that issuer and no implied ownership of unrelated portfolio projects.

**WHERE**  
The machine-readable contract lives in `src/governance/capitalControlArchitecture.ts`. Focused regression coverage lives in `src/governance/capitalControlArchitecture.test.ts`.

**WHEN**  
The architecture stays `design_only` until a legally authorized signatory and qualified corporate/securities counsel establish and verify the actual entity, governing documents, ownership boundaries, capitalization, security terms, compliance path, and required disclosure/intermediary evidence.

**WHY**  
The founder wants access to capital at both the portfolio and project level while preserving deliberate control boundaries. The contract prevents software from converting that intent into false legal claims or accidental operational authority.

**HOW**  
High-impact capital actions fail closed. Securities issuance, offering publication, core-IP transfer, and founder-control modifications require a `legally_verified` architecture state plus action-specific evidence just to become review-eligible. Even when every registered claim is present, these actions stop at `RECONFIRM`; the evaluator never returns execution authority. A separate, verified founder/legal authority receipt is required before any real-world action. Project offerings additionally require proof of the project ownership boundary and continuing parent/founder control. Two actions remain hard blocked from automation: surrendering founder control and granting investors operational authority over repositories/providers.

## Control invariants

- Economic ownership does not grant repository, merge, deployment, provider, credential, or product execution authority.
- Repository/project identity does not prove corporate ownership or subsidiary status.
- Share classes, voting ratios, board rights, valuation, and offering terms remain unknown until executed documents prove them.
- A project-level raise must not silently transfer portfolio IP or another project's economic interest.
- Founder-control surrender is never an automated capital action.
- Capital-policy evaluation is non-authorizing; caller-supplied state or evidence labels cannot mint execution authority.
- A public offering cannot be represented as live before issuer identity, legal-entity status, governing documents, capitalization, security terms, compliance path, required intermediary status, disclosures, and post-change control are independently verified.

## Money path

The intended capital ladder is intentionally non-binding until legal verification:

`private portfolio -> verified parent/project issuer -> selected investment lane -> compliant offering -> capital received -> evidence-backed use of funds`

No amount, valuation, dilution percentage, voting ratio, security type, or fundraising platform is locked by this document.

## Stop conditions

Stop and return `DENY` or `RECONFIRM` when any of these are true:

- the legal architecture is still `design_only` for an action that changes capitalization, control, IP ownership, or offering state;
- the issuer or legal entity cannot be proven;
- project ownership cannot be proven for a project-specific raise;
- post-transaction founder/parent control cannot be proven;
- required securities-compliance or intermediary evidence is missing;
- separate founder/legal execution authority is absent;
- the action would give an investor operational authority merely because they invested;
- the action would surrender founder control through an automated path.

## Rollback

This v1 change is source-only. Revert the focused capital-control commits. No legal entity, security, investor right, provider state, deployment, payment, or external filing is created by the source change itself.

## Next gate

Translate the design into an attorney-reviewed entity/cap-table/IP map. Only after executed documents exist should FCR move the observed architecture state from `design_only` to `legally_verified`, and that state transition must be backed by exact evidence references. Even then, a consequential capital action still requires a separate verified founder/legal execution-authority receipt; the policy evaluator itself never supplies that authority.
