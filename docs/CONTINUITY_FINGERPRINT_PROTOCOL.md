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
