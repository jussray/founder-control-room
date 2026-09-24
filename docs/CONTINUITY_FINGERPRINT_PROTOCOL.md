# Continuity Fingerprint Protocol

Purpose: make future founder shorthand resolvable without guessing, while preserving current repository and provider evidence as authority.

## Resolution rule

Use shorthand as a retrieval signal, never as proof.

```text
founder shorthand
→ conversation/history fingerprints
→ candidate project
→ authoritative repository/provider verification
→ action
```

For Founder Control Room, high-signal fingerprints include: merge intent, evidence expiry, truth lease, authority, founder approval, control plane, release truth, agent registry, mission engine, approval engine, provider adapters, cross-repo coordination, and portfolio state.

If a fingerprint could belong to another project, verify the exact repo, branch, files, issue/PR, provider state, and current `main` before acting.

## TRUE-FIRST discovery invariant

Build the strongest evidence-bound TRUE baseline before trying to identify what is false.

```text
authoritative subject
→ exact repo/runtime/provider binding
→ VERIFIED + TRUE claims with evidence refs only
→ deterministic baseline fingerprint
→ bounded continuity/proof cookie
→ contradiction search
→ exact-subject challenge
→ reconfirm TRUE, VERIFIED_CONTRADICTION, or re-baseline
```

Rules:

1. A TRUE baseline may contain only claims that are `VERIFIED`, explicitly TRUE for the inspected subject, and bound to at least one evidence reference.
2. `INFERRED`, `REMEMBERED`, `UNKNOWN`, `BLOCKED`, `STALE`, evidence-free, or already-FALSE claims never enter the TRUE baseline. Preserve them separately rather than upgrading them.
3. Falsehood is discovered only by fresh verified contradictory evidence against the same exact subject binding. A moved repo head, runtime, provider state, scope, or authority state makes the predecessor baseline `STALE`; movement is not itself proof that the old claim was false.
4. Rebuild TRUE first after any load-bearing movement, then challenge the new baseline. This prevents comparing two different realities and calling the difference a lie.
5. The baseline fingerprint must be deterministic over the load-bearing project, repository, branch/head or equivalent runtime identity, scope, and verified TRUE claims/evidence refs.
6. The continuity/proof cookie must be non-secret, freshness-bounded, optionally parent-linked to its predecessor, and marked `EVIDENCE_ONLY`. It cannot grant approval, merge, deploy, publish, provider, payment, or mutation authority.
7. Preserve predecessor fingerprints/cookies and link successors. Do not overwrite history to make the present look cleaner.
8. For UI/runtime truth, exact-head Playwright or equivalent real-path evidence remains required where the governing project contract requires it.

The executable FCR implementation is `src/continuity/trueFirstPortfolio.ts`. It intentionally returns `BASELINE_STALE` when a head/cookie binding moves instead of manufacturing a FALSE verdict.

## Genesis fingerprint

When asked when this project started, do not infer genesis from the oldest visible chat. Resolve in this order:

1. GitHub repository `created_at`.
2. Root/first commit reachable from authoritative history.
3. Earliest substantive implementation commit.
4. Historical docs that reference earlier work.
5. Earliest available conversation about the project.
6. Earlier uploaded designs, files, or artifacts.
7. Founder testimony, clearly labeled as founder-reported rather than GitHub proof.

Keep idea genesis, repo genesis, first recorded build, first substantive build, launch/production milestones, and current state separate.

## Truth states

Always distinguish VERIFIED, INFERRED, REMEMBERED, UNKNOWN, STALE, and BLOCKED.

## Supersession and decay

A historical fix, approval, deployment, branch, screenshot, PR description, or conversation does not stay authoritative forever. If `main`, provider state, schema, runtime, or governing contract changed, revalidate before reusing the old conclusion.

Preserve the chain:

```text
prior decision
→ evidence then
→ validity conditions
→ superseding event
→ revalidation
→ current authority
```

## Capability continuity without historical erasure

Connector and external-capability continuity has two independent time planes:

1. **historical evidence**: what a receipt proved at the time it was observed; and
2. **current observation**: what the authoritative runtime/provider exposes now.

A fresh current observation may supersede a present-tense capability claim. It may not rewrite history. Verified predecessor evidence remains append-only provenance unless the receipt itself is proven forged, misbound, or otherwise invalid.

When evidence exists, keep these capability dimensions separate rather than collapsing them into one `available` boolean:

- catalog visibility;
- installation or enablement;
- authentication/session identity;
- callability from the current execution surface;
- read capability;
- write capability/authority;
- provider acceptance; and
- verified successful outcome.

Each observation must be time-bound and source-bound. `Not exposed in this session at T2` is a valid current observation. It is not evidence that the connector never existed at T1.

Resolution examples:

| Historical receipt | Current observation | Correct classification |
| --- | --- | --- |
| successful connector use | connector absent now | `HISTORICALLY_VERIFIED` + `CURRENTLY_UNAVAILABLE` |
| successful connector use | no current probe | `HISTORICALLY_VERIFIED` + `UNKNOWN` |
| none found | connector absent now | current absence only; historical existence remains `UNKNOWN` |
| one current surface says installed, another cannot invoke | contradictory current evidence | `CONNECTOR_STATE_CONFLICT` |

Never infer an uninstall actor or root cause from disappearance alone. `Founder removed it`, `agent removed it`, `provider delisted it`, `OAuth expired`, and `eligibility changed` each require their own evidence receipt.

Hard invariants:

```text
CURRENTLY_UNAVAILABLE != NEVER_EXISTED
UNKNOWN != NO
STALE != FALSE
INSTALLED != AUTHORIZED
AUTHORIZED != SUCCESSFUL
SUCCESSFUL_ONCE != VERIFIED_NOW
```

Continuity fingerprints and proof cookies may link predecessor and successor observations, including the capability dimensions and evidence references above. They remain non-secret state markers only. They cannot install a connector, authenticate a session, create provider authority, replay approval, or convert historical success into current capability.

## Reuse rule

Every correction should leave a reusable fingerprint so the same discovery cost is not paid twice. Prefer exact issue, PR, SHA, route, function, provider, evidence receipt, or prior decision before broad scans.

## Federated continuity quartet

Founder Control Room, Chief AI Machine, Sol Continuity, and PromptOS are sovereign repositories that cooperate through evidence, not through inherited authority.

- **FCR** is the founder control plane for consequential execution, current approval binding, provider/runtime mutation, merge/deploy boundaries, and verified operational receipts.
- **Chief AI Machine** is the reasoning, capability-composition, governance, challenge, and test-ledger plane. It may prove or invalidate assumptions but cannot self-authorize consequential FCR action.
- **Sol Continuity** is the assistant/model continuity and capability-routing plane. It carries current state between sessions, models, tools, and adapters without turning conversational continuity into proof or authority.
- **PromptOS** is the intent/workflow compiler and prompt-governance plane. It may structure the mission and constraints but cannot create execution authority.

The quartet is federated, not merged. Each repository must remain independently understandable, testable, reversible, and operable within its own authority ceiling. No repository becomes the identity, datastore, runtime, or standing authority of another merely because their fingerprints are linked.

### Bidirectional cookie rule

Whenever material work crosses any two quartet members, reconcile continuity in both directions:

```text
source exact repo + branch + head
→ subject / evidence / runtime / provider fingerprints
→ non-secret continuity or proof cookie
→ receiving repo re-verifies current source and local authority
→ bounded action or no-op
→ re-observe outcome
→ successor fingerprint / cookie + receipt back to the federation
```

A cross-repo cookie must be treated as a state/evidence marker only. It is not a browser cookie, secret, credential, approval token, merge token, deploy token, publish token, or standing mutation authority. A source repo's approval or authority never transfers through the cookie.

Movement in any load-bearing source or target dimension, including repository head, subject, scope, authority, runtime, provider, evidence requirement, or founder proposal, expires the affected present-tense continuity claim until revalidated. Preserve predecessor markers and receipts as historical provenance.

Fresh verified evidence may update or invalidate a receiving repo's stale fingerprint, proof cookie, issue state, assumption, code claim, or next gate. Evidence alone never mutates. Under current founder approval bound to the exact proposal, and only when the target repository's own authority and checks are satisfied, that verified evidence may drive the smallest reversible merge, repair, implementation, rectification, stale-proof replacement, issue reconciliation, or forward gate.

After any approved mutation, the target repo must re-resolve its authoritative state, verify the real outcome, and emit a successor marker linked to the predecessor. If outcome proof is missing or contradictory, classify it honestly instead of exporting a green cookie.

Any model, agent, connector, or future interface working through FCR must preserve this quartet boundary. Models may exchange context and evidence; they may not manufacture shared standing authority.

This protocol supplements `AGENTS.md`, Founder Intelligence, merge authority, truth-decay, public-communication, and portfolio-control-plane contracts. It never overrides stricter authority or grants mutation permission by itself.
