---
name: portfolio-control-plane
version: 1.0.0
status: active
scope: founder-control-room
owners:
  - founder
review_cadence: quarterly
last_reviewed: 2026-07-17
compatibility:
  node: ">=20"
  evidence_schema: "1.x"
---

# Portfolio Control Plane Skill

## Who

This skill is for AI operators, repository agents, and maintainers working inside Founder Control Room or coordinating approved work across Jussray projects.

The founder remains the final authority. An AI may inspect, reason, propose, implement on an approved branch, and produce evidence. It may not convert analysis into founder approval.

## What

Use this skill to:

- inspect project, repository, provider, mission, evidence, approval, release, and rollback state;
- create the smallest coherent repair or capability behind existing provider abstractions;
- run approved, project-scoped verification through the guarded terminal;
- normalize exact-head evidence from type, lint, unit, build, security, migration, and browser checks;
- coordinate portfolio rules without mixing product catalogs, private data, credentials, customers, vendors, or checkout authority;
- prepare founder-readable proof and the next explicit approval gate.

Do not use this skill as an unrestricted shell, autonomous merge bot, deployment bypass, billing authority, secret manager, or substitute for repository-specific skills.

## When

Invoke this skill when work affects one or more of:

- Control Room APIs, controllers, providers, missions, events, migrations, evidence, approvals, releases, terminal commands, or audit records;
- cross-repository coordination;
- verification or integration of a project branch;
- provider replacement, schema evolution, runtime upgrades, incident recovery, or decade-scale maintenance;
- the shared Story, Quality, Care, and Proof moat across Juss Beautiful Hair and Untold Stories.

Do not invoke it for ordinary copy edits that do not touch operating contracts, authority, verification, or cross-project boundaries.

## Where

Authoritative locations are:

- `GLOBAL_AI.md` for the global founder contract;
- `AGENTS.md` and provider-specific instruction files for entry-point behavior;
- `src/providers/` for provider adapters;
- `src/terminal/` for allowlisted execution;
- `src/http/routes/` for authenticated control surfaces;
- `src/controllers/` for reconciliation behavior;
- `supabase/migrations/` for schema evolution;
- `artifacts/billgates/` for material decision records;
- each managed repository's own `skills/**/SKILL.md` for project-specific behavior.

Control Room operational storage must remain separate from Se’kret Bip and from every storefront's private customer or vendor data.

## Why

The Control Room exists to preserve founder authority while making work inspectable, repeatable, provider-independent, and reversible. The goal is not maximum automation. The goal is durable leverage with explicit provenance and bounded blast radius.

## How

Use the exact operating stack:

```text
/garyvee lindymode redteam l99 redteam ooda
```

1. **GaryVee frame** — define founder value, operator outcome, and fastest truthful proof.
2. **Lindy screen** — prefer simple interfaces, Git primitives, portable data, additive migrations, replaceable providers, and reversible actions.
3. **Red Team I: premise** — attack whether the requested automation or control should exist at all.
4. **L99 system pass** — map authority, identities, projects, providers, state transitions, evidence, audit history, failure modes, rollback, privacy, and cost.
5. **Red Team II: plan** — attack the selected design for stale evidence, replay, privilege escalation, provider lock-in, founder lockout, cross-project contamination, and incomplete rollback.
6. **OODA** — observe current truth, orient using constraints, decide one bounded path, act minimally, verify, and repeat.

## Inputs

Required inputs for material work:

- repository and project identity;
- current branch and exact 40-character commit SHA;
- requested outcome and affected authority boundary;
- current provider, schema, deployment, and runtime evidence;
- required checks and their versions;
- founder approval state;
- rollback or roll-forward path.

Missing inputs are blockers, not invitations to guess.

## Outputs

Produce:

- files and systems inspected;
- premise risk;
- L99 system map;
- selected decision and rejected alternatives;
- plan risk;
- exact files changed;
- exact checks executed and evidence references;
- security, privacy, provider, cost, and deployment impact;
- rollback path;
- unresolved risks;
- next founder approval gate.

## Authority

No approval carries forward. Keep these gates separate:

- read and inspect;
- dependency or browser setup;
- branch or sandbox creation;
- code or migration proposal;
- merge;
- production migration;
- deploy;
- rollback;
- auth, secret, DNS, billing, or destructive data operations.

A passing model review is not founder authorization. A passing merge is not deployment proof. A successful provider call without a finalized audit record is ambiguous and must not be retried automatically.

## Evidence

Evidence is valid only when it is bound to:

- project and mission;
- command or check version;
- exact commit SHA;
- environment and runner identity;
- timestamp;
- dependency lock or artifact digest when applicable;
- complete, non-truncated output for critical checks.

Skipped, missing-log, `steps: null`, stale-SHA, transferred, manually asserted, or truncated-critical results cannot satisfy a proof gate.

## Project reality audit

When the founder asks whether a project, product, subsystem, storefront, or portfolio slice "works," do not infer health from repository existence, merged code, old screenshots, a successful deploy event, or a single green check. Reconstruct current truth from the strongest claim-appropriate evidence.

Use this evidence ladder in order:

1. resolve the authoritative repository, default or requested branch, and exact current head SHA;
2. inspect required current-head CI, type, lint, unit, integration, security, migration, and contract checks;
3. require targeted Playwright evidence for browser-observable UI or user-flow claims;
4. require provider, API, job, database, webhook, or other direct runtime evidence for non-browser backend claims;
5. for live or production claims, bind deployment/runtime identity to the same exact head or explicitly mark the proof stale;
6. compare the newest decisive evidence with prior evidence only to explain change, never to renew current proof.

Classify each audited project or claim as exactly one of:

- **VERIFIED** — the exact current head has the required code-level checks and claim-appropriate runtime or Playwright evidence;
- **PARTIAL** — a substantive path works, but exact-head, end-to-end, provider, deployment, or runtime proof is incomplete;
- **UNKNOWN** — evidence is absent, inaccessible, too weak, or not tied to the claim;
- **BLOCKED** — a known failing gate or unavailable authority prevents the claim from being proven;
- **STALE** — previously valid evidence belongs to an older head, environment, deployment, or expired evidence window.

Passing CI alone proves only the checks that actually ran. It does not prove a live product. Historical runtime or Playwright proof does not renew itself after the source head, deployment identity, authority, environment, or relevant evidence changes. A skipped, startup-failed, cancelled, missing-log, truncated-critical, or never-executed check is not green evidence.

For portfolio summaries, report at minimum: project, current head, decisive evidence, classification, what is known to work, what is not yet proven, and the smallest next proof that could legitimately raise the classification. Prefer one current truthful status over optimistic aggregation.

## ULTRATHINK repair loop

After the reality audit identifies a failing or incomplete claim, repair the portfolio by cause, not by symptom. Before changing code, classify the decisive blocker as one of these repair classes:

- **CODE_DEFECT** — repository implementation is causally wrong or incomplete;
- **PROOF_DEFECT** — the intended behavior may work, but the verifier, evidence binding, or claim scope is wrong;
- **PROVENANCE_DEFECT** — valid founder/release history is rejected or cannot be bound to the exact head under the governing authority model;
- **CREDENTIAL_AUTHORITY_BLOCKER** — a required secret, token, identity, permission, or protected-environment grant is missing, invalid, rejected, or outside current authority;
- **PROVIDER_DEPLOYMENT_BLOCKER** — repository build/source is valid but the authoritative external provider has not deployed, routed, synchronized, or exposed the required current release;
- **STALE_EVIDENCE_BLOCKER** — only older-head or expired evidence exists and no current failure has yet been proven.

Apply the smallest safe fix only to the causal class. A code defect may receive a focused code patch. A proof or provenance defect may receive a focused verifier/governance repair only when the governing authority model supports it. Credential and provider blockers must remain blocked until the authorized external state changes; never bypass authentication, invent secrets, weaken protected environments, create a second deployment authority, or relabel missing provider proof as application success.

Prefer an existing open repair branch or pull request when it already owns the same causal failure. Do not create a duplicate repair lane merely because a check is red. Preserve unrelated work, keep the blast radius bounded, and stop if the next step requires founder-only authority that has not been granted.

For each attempted repair:

1. capture the pre-fix exact head and decisive failing evidence;
2. identify the repair class and the smallest causal file/provider surface;
3. make only the authorized change;
4. resolve the new exact head;
5. rerun the narrowest decisive check first;
6. rerun claim-appropriate integration, Playwright, provider, or production proof when the claim requires it;
7. compare before/after evidence and update VERIFIED/PARTIAL/UNKNOWN/BLOCKED/STALE without optimistic carry-forward;
8. record any remaining provider, credential, deployment, privacy, cost, or rollback gate as the next explicit founder action.

A red check is not permission to make it green. The objective is truthful recovery of founder intent, not green dashboards.

## Project separation

Shared philosophy may cross projects. Operational data may not.

- Juss Beautiful Hair retains hair products, hair vendors, hair customers, hair checkout, and private supplier intelligence.
- Untold Stories retains apparel and lifestyle products, vendors, customers, checkout, and fulfillment.
- Se’kret Bip private teen, family, journal, voice, media, emotional-safety, and parent-visibility data never enters Control Room operational storage.
- Software projects retain separate credentials, provider records, deployments, and billing authority.

## Failure and rollback

Fail closed when:

- the exact head cannot be proven;
- a provider action cannot be audited;
- a schema migration is absent from history or differs from reviewed source;
- an auth, RLS, privacy, secret, or project boundary is uncertain;
- a browser or deployment check did not actually execute;
- the requested action exceeds current approval.

Prefer a forward-compatible repair. When rollback is necessary, identify the exact commit, migration, configuration, provider action, or release record to reverse. Never delete evidence to make state appear clean.

## Ten-year maintenance contract

This skill must evolve without silently changing authority.

- Increment the major version for breaking changes to authority, evidence, mission, command, event, or provider contracts.
- Maintain backward-compatible readers through a documented deprecation window.
- Review quarterly and after every material provider, runtime, schema, auth, or incident change.
- Keep provider-specific SDK logic behind adapters.
- Prefer additive migrations and restore-tested backups.
- Record material changes in `artifacts/billgates/` and enforce critical rules with tests or static contract checks.
- Never promise ten years of zero maintenance; preserve a controlled upgrade path for ten years of change.

## Definition of done

Work is complete only when the final exact head has executable evidence, required checks pass, the authorized action is recorded, post-change verification passes, rollback is documented, and every remaining risk is either zero or explicitly founder-accepted.
