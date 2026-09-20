# Multi-Witness Repair Authority

Status: portfolio governance contract. This file narrows and operationalizes the existing Founder Control Room authority model; it does not turn evidence, fingerprints, proof cookies, trackers, attack results, or model output into authority.

## Purpose

When a relevant witness proves a real defect, the portfolio should repair the defect at the plane that owns it instead of stopping at observation. Repair authority is scoped, reversible, fingerprint-bound, and evidence-backed.

A witness may repair only the plane it actually owns. Cross-plane promotion still requires the higher plane's evidence.

## Required binding

Every repair must bind, when applicable:

- canonical repository and target branch;
- exact base/head SHA or deployed release identity;
- provider account/organization/project/zone/service identity;
- affected test, workflow, route, resource, issue, document, or runtime surface;
- `failure_fingerprint` identifying the incident;
- one or more evidence-only `proof_cookies` identifying observations;
- before-state evidence;
- rollback or compensating action;
- post-action readback.

Changing a load-bearing identity expires predecessor repair authority and proof.

Fingerprints and proof cookies are non-secret correlation markers only. They never grant authentication, founder approval, merge permission, deployment permission, credential access, or mutation authority by themselves.

## Portfolio Repair OS

Every consequential witness-triggered repair runs one fused operating loop. The loop may narrow or stop authority; it may never widen it.

1. **Lindy** — prefer the existing authoritative carrier, stable interface, simple platform primitive, reversible repair, and minimum new dependency surface.
2. **Red Team I** — attack the premise before mutation: establish that the defect is real, the requested change should exist, the proposed scope serves the product goal, and inaction is not the safer truthful outcome.
3. **ATTACK TEN** — pressure the proposed repair for wrong-subject targeting, stale proof, authority inversion, hidden coupling, failure masking, unsafe fallback, rollback weakness, user-outcome mismatch, temporal races, and missing verification.
4. **OODA Observe** — reacquire current fingerprints/proof cookies and all relevant witnesses. Record VERIFIED / INFERRED / UNKNOWN / BLOCKED plus STALE / SUPERSEDED / CONTRADICTED when needed.
5. **OODA Orient** — identify the owning truth plane, authoritative source, current consequence class, and distinct incidents. Do not collapse unrelated reds.
6. **OODA Decide** — select one smallest reversible action, acceptance condition, and stop condition.
7. **L99 Authority** — before Act, verify exact subject identity, provenance, state, authority ceiling, evidence requirement, rollback, continuity, drift/expiry, and whether the owning execution principal actually has the required provider permission.
8. **Act** — execute only through the authority that owns the failed plane. Evidence or reasoning output cannot impersonate that authority.
9. **Red Team II** — attack the actual implementation for regression, privacy/security breakage, stale assumptions, authority drift, provider mismatch, fake-green behavior, and recovery failure.
10. **Attack workflow verification** — consequential repairs use PromptOS recursive hardening where available: 10 OODA cycles covering `authority-inversion`, `evidence-falsification`, `human-outcome`, and `temporal-race`. Attack findings may revise or block the repair; they never authorize it.
11. **Verify** — prove the repaired claim at the highest relevant truth plane. Browser/user-path repairs require Playwright. Provider repairs require post-write provider readback. Source repairs require exact-head source/test evidence.
12. **Loop or stop** — loop only if the intended outcome remains unproven and current authority remains valid. Stop when acceptance is proved or a real evidence/authority edge is reached.

The machine-readable reusable workflow lives in PromptOS (`REPAIR_OS_SEQUENCE`, `ATTACK_WORKFLOWS`, and the existing `juss-v10/recursive-hardening@v1` contract). FCR owns consequential execution authority and cross-plane receipts; PromptOS owns workflow semantics; each product repository retains its stricter local invariants.

## Repair classes

### 1. GitHub / trusted source operator

A trusted repository operator such as Codex/ChatGPT or Claude may, inside an already-authorized repository scope:

- inspect source, diff, tests, CI, reviews, and exact-head evidence;
- implement the smallest focused reversible source/config/test/documentation fix;
- update or add the narrowest useful test;
- rerun a failed GitHub Actions job or failed jobs when rerun is the correct diagnostic action;
- update the existing issue/PR receipt with current evidence;
- merge only when the repository's current merge policy independently authorizes that exact candidate.

It may not manufacture green by skipping, weakening, quarantining, mocking away, or relabeling a real failure.

### 2. Cloudflare / runtime provider

A trusted provider executor may repair a verified Cloudflare runtime/configuration defect when all of the following are true:

- exact account, zone/project, Worker/Pages/Application, environment, and expected runtime identity are verified;
- the change is bounded to the failed surface;
- a before-state receipt and rollback target exist;
- the mutation is reasonably reversible;
- no new spend, ownership transfer, credential exposure/rotation, or destructive deletion is required;
- Access/auth exposure is not broadened beyond the already-approved intended topology;
- post-write provider readback is performed;
- user-observable claims receive browser/Playwright proof when applicable.

Examples include restoring a known-good route/binding/configuration, deploying an already-authorized exact release, or reconciling a bounded provider setting to the repository-owned desired state.

### 3. Supabase / Firebase / data authority

A trusted data-plane executor may apply an already-reviewed, exact-subject, forward-only repair when it is non-destructive and does not widen identity or access authority. Required conditions:

- exact account/org/project fingerprint and environment are verified;
- source migration/configuration is already reviewed on the exact authorized release;
- dry-run or equivalent preflight succeeds where available;
- rollback or a forward compensating repair is defined;
- the action does not weaken RLS, authentication, authorization, consent, tenancy, parent/child boundaries, or secret handling;
- live schema/configuration is read back after mutation.

Destructive schema/data operations, access widening, credential operations, ownership changes, and identity/consent boundary changes remain explicit founder gates.

### 4. Playwright / browser

Playwright is an authoritative witness for observable browser/user-path behavior, not an independent mutation principal. It may:

- produce screenshots, traces, console/network evidence, and exact-path failure receipts;
- trigger or reopen the matching repair incident;
- verify the repaired user path.

It may not use browser state, cookies, or UI availability as permission to perform an otherwise unauthorized consequential action.

### 5. Linear / Asana

Trackers have record-repair authority over their own project state. They may:

- reopen a task marked Done when stronger evidence proves it incomplete;
- update status, blocker, acceptance criteria, evidence links, owner, and next gate;
- close or mark superseded only when authoritative evidence supports that state.

Tracker state never proves source, deployment, runtime, or user outcome by itself and cannot authorize those mutations.

### 6. Notion / Google Drive / repository docs

Documentation systems have documentation-repair authority. They may:

- correct stale requirements, architecture notes, runbooks, decision records, and proof links;
- mark historical/superseded material explicitly;
- bind current claims to authoritative source/runtime evidence.

Documentation edits cannot silently change product authority, privacy policy, contractual commitments, or production state.

### 7. Slack / internal communication

Internal communication systems may repair operational record state by posting or updating bounded incident/status evidence in the already-designated internal workspace/channel when that action is available and contains no secret/private user content. They may surface contradictions, request the existing owner, and record verified resolution.

A Slack message is not merge/deploy/provider authority. External communications, commitments, contracts, publication, and customer/vendor promises remain separately gated unless a pre-existing approved automation explicitly covers them.

### 8. Gmail / external communication

Email is primarily a human/external-consequence witness. Automated mutation is limited to pre-authorized mailbox hygiene or exact existing communication automations. A failure investigation does not create authority to email customers, vendors, investors, government offices, or other external parties.

## Necessary-fix default

When a verified defect blocks a real launch/user path, a trusted operator should carry the smallest safe repair through every already-authorized reversible plane needed to restore that path instead of stopping after source code.

The repair stops at the first unresolved authority edge. The following remain hard founder gates unless an exact pre-existing policy explicitly delegates them:

- new spending or billing commitments;
- contracts or material legal commitments;
- secret creation, exposure, rotation, or deletion;
- account or ownership transfer;
- destructive or irreversible deletion/migration;
- new authority expansion;
- external publication/communication outside an already-approved automation;
- privacy/identity/access expansion not already represented by reviewed policy.

## Contradiction rule

Witnesses do not vote. The highest-authority witness for each proof plane controls that plane.

Examples:

- GitHub green + stale Cloudflare runtime = SOURCE VERIFIED / RUNTIME BLOCKED.
- Linear Done + failing exact-head CI = TRACKER STALE / TEST BLOCKED.
- Slack says deployed + `/version` mismatch = COMMUNICATION OBSERVED / RUNTIME CONTRADICTED.
- Notion requirement + absent implementation = INTENT VERIFIED / SOURCE UNKNOWN.

A contradiction creates or updates one incident receipt. It does not get averaged into “mostly green.”

## Required repair report

For every consequential repair, retain:

1. REALITY
2. WITNESSES
3. FIX
4. PROOF
5. RISK
6. ROLLBACK
7. NEXT GATE

One law: the witness that can prove the defect may trigger the repair; only the authority that owns the affected plane may execute it.
