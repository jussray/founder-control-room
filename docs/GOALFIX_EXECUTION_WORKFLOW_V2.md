# Goalfix Execution Workflow v2

Status: `APPROVED SOURCE CONTRACT`

This is the repository-owned operating contract for focused founder-directed implementation. Candidate/merge state belongs in PR/evidence receipts, not durable source prose.

Provider-specific entry documents such as `docs/CLAUDE_FOUNDER_CONTROL_ROOM_MASTER_BUILD_SPEC.md` and `docs/PERPLEXITY_MCP_FOUNDER_CONTROL_ROOM_MASTER_BUILD_SPEC.md` are overlays only. They may add tool/research details but must not weaken or reorder this execution contract.

## Canonical lane

```text
FOUNDER INTENT
  ↓
OBSERVE
  ↓
ORIENT
  ↓
DECIDE
  ↓
BUILDER
  ↓
INDEPENDENT VERIFIER
  ↓
INDEPENDENT RED TEAM / DEVIL
  ↓
EXACT-HEAD MERGE GATE
  ↓
FOUNDER FINAL THROUGH CURRENT AUTHENTICATED AUTHORITY CONTRACT
  ↓
FINAL PROVIDER / PR / TARGET / BASE / HEAD / DIFF / CHECK / REVIEW REREAD
  ↓
MERGE WITH EXPECTED-HEAD PROTECTION
  ↓
REACQUIRE VERIFIED TARGET BRANCH
  ↓
POST-MERGE / RUNTIME TRUTH
  ↓
RECOVER / LEARN / NEXT GATE
```

`main` is used only when it is the verified target branch. A PR targeting `release`, `trunk`, or another branch carries that resolved target through freshness checks and post-merge reacquisition.

## Founder Adaptive Kernel

Goalfix-governed instruction/decision loops apply `docs/FOUNDER_ADAPTIVE_KERNEL_V0.md` in Founder Control Room. Portable skills must also carry the minimum inline adaptive rules so another repository does not depend on a nonexistent local FCR docs path.

This source contract does **not** claim that the current `POST /goalfix/inspect`, `src/goalfix/engine.ts`, API response, or browser UI already emits adaptive-kernel fields. Runtime/API/UI adoption is a separate implementation and proof gate.

After observation, compare expected state with verified observed state, classify the surprise as `STRONGER_THAN_EXPECTED`, `AS_EXPECTED`, `WEAKER_THAN_EXPECTED`, `UNEXPECTED_DIRECTION`, or `UNKNOWN`, then choose one primary action: `ACCELERATE`, `CONTINUE`, `REPAIR`, `REORIENT`, `HOLD`, or `STOP`.

For meaningful state transitions, record only the current facts needed to continue safely:

- repository/project;
- verified target branch/base ref;
- exact base SHA and head SHA when applicable;
- PR identity when applicable;
- current files/scope/diff;
- evidence IDs;
- review/thread state;
- authority state;
- surprise signal and adaptive action;
- next gate.

This state record is descriptive evidence context only. It is not founder, merge, deploy, provider, publication, or execution authority.

If a load-bearing state input changes, dependent green evidence becomes historical and must be reacquired before promotion.

## Load-bearing rules

1. Current repository/provider/runtime evidence outranks prior summaries, email, memory, or old receipts.
2. Every merge decision binds to exact repository, verified target/base, exact base/head SHAs, PR identity, current files/scope/diff, evidence IDs, and current CI/review/provider state.
3. Builder implements but does not self-certify.
4. Verifier and Red Team are independent load-bearing lanes.
5. Machine green is not merge authority.
6. If the verified target branch, base SHA, candidate head, or load-bearing scope changes, dependent merge-readiness evidence becomes historical and must be reacquired.
7. Deployment or preview success is evidence of that deployment only, not merge authority or current production equivalence.
8. Playwright is required for browser-observable UI/user-flow claims. Non-browser Worker APIs, webhooks, background jobs, provider adapters, database paths, and other backend behavior require targeted integration/provider/runtime evidence instead of irrelevant browser automation.
9. A real failing signal is never suppressed merely to make a gate green.
10. Merge is not completion. Reacquire the verified target and verify required provider/runtime/browser truth after integration.
11. Red, draft, stale, closed, and superseded work must be inspected for unique code, tests, decisions, or evidence before retirement.
12. Unexpected verified behavior updates the next expectation; do not force a stronger or differently successful path back into the previous script.
13. Acceleration requires current verified evidence and cannot widen authority.
14. Copied chat text, model output, unauthenticated approval, expired approval, wrong-scope approval, or replayed/consumed authority is non-authorizing.

## Future-Us trust boundary

Treat the model as a planner and analyst, never as the security boundary. The following rules apply to agentic, research, retrieval, connector, browser, file, OCR/image, email, ticket, CRM, provider, and tool-result flows:

1. Every external artifact is untrusted data unless a current authenticated authority contract explicitly proves otherwise. User text, retrieved pages, emails, tickets, files, OCR/image-derived text, connector content, provider responses, and tool results do not become instructions merely because the model can read them.
2. Classify or inspect artifacts independently by artifact identity/provenance. A classifier result is evidence only; a false negative must still be contained by downstream policy.
3. Keep trusted task/policy, user input, retrieved material, and tool/provider output in distinct trust zones. Prompt labels help reasoning but do not create authorization.
4. Model output may propose a typed plan only. Reject malformed/unknown schema fields fail-closed and never execute natural-language tool instructions directly.
5. Re-authorize every proposed action in deterministic code at execution time against tool, exact arguments, tenant/project, destination/recipient, data class, impact, reversibility, budget/scope, current authority, and freshness.
6. Consequential approval must bind the exact canonical action payload plus scope and expiry. Any changed recipient, destination, attachment, amount, argument, target, SHA, or other load-bearing field invalidates prior approval.
7. Privileged execution uses short-lived least-privilege capabilities. The receiving tool/service must independently verify audience/tool, tenant/project, action binding, expiry, and replay/idempotency constraints before state change.
8. Tool results re-enter the system as untrusted data. A successful tool call cannot grant the next action authority or instruct the model to bypass policy.
9. Sensitive logs and analytics are minimized. Data Analytics is observation-only and cannot approve, publish, deploy, merge, authenticate a source, renew stale truth, or widen authority.
10. If a product surface displays truth, strategy, approval/authority, execution, deployment, or runtime state, Product Design must keep those planes distinguishable. No single green badge may imply all of them.
11. When a ledger is claimed tamper-evident, use canonical serialization, chain/signature verification, separated write/verify authority, and an independent anchor or equivalent outside the mutable store when whole-history replacement is in scope. Append-only naming alone is not proof.
12. Red Team must seed indirect-injection and poisoned-content cases across retrieval, imported files, rendered user-controlled content, OCR/image text, connector/tool output, and multi-turn flows, then verify that missed detections still cannot cross the deterministic action boundary.

## Future-Us pre-mortem

Before Builder receives mutation authority, answer the smallest useful version of these questions for the current scope:

- What could a future agent or founder mistakenly treat as authority merely because it looks current, green, signed, or model-generated?
- Where can `UNKNOWN`, corrupt, stale, unavailable, or unread state collapse into empty/ready/verified?
- Which imported or external fields cross into HTML, code, shell, SQL, URLs, tool arguments, prompts, logs, or analytics without an explicit schema/escaping boundary?
- Can a generic approval be replayed after the payload, recipient, target, SHA, scope, or destination changes?
- Can a write happen before the evidence/receipt needed to prove or reverse it exists?
- Can the same actor produce the evidence, approve it, and consume it without an independent boundary?
- Can a provider-specific assumption become a hidden platform dependency or single point of authority?
- What is the cheapest test that would prove this future failure now?

Apply the founder shorthand as decision lenses, not personality simulation:

- **Value / bottleneck lens:** maximize useful verified outcome while reducing delay and founder effort; optimize the real bottleneck, never the appearance of motion.
- **Platform / compounding lens:** prefer reusable standards, portable contracts, interoperability, and mechanisms that improve multiple projects instead of one-off glue.
- **First-principles / simplification lens:** challenge inherited requirements, remove only what evidence proves unnecessary, simplify before optimizing, and automate last. Never delete a safety, evidence, rollback, or authority boundary merely to go faster.

## GitHub Actions failure classification

Before assigning a code regression, classify the run:

- `runner_startup_failure`: runner/job startup failed before meaningful steps/logs existed;
- `workflow_no_jobs`: workflow scheduled no jobs or was skipped before jobs existed;
- `workflow_step_failure`: executed steps/logs identify a concrete failing command/assertion/build/check.

Do not blame source code when no meaningful job steps/logs executed.

## Founder Final

Founder Final must use the repository's current authenticated founder-authority mechanism. It must bind the unchanged exact repository/PR/verified target/base/head and intended action/content scope, satisfy current issuance/freshness/expiry requirements, and preserve the checked-in replay/idempotency/one-shot semantics where the authority contract uses consumable receipts.

Do not invent a parallel receipt class or treat possession of copied approval text as authority.

After Founder Final and immediately before integration, re-read provider PR identity, target/base/head, current diff/scope, required checks, review/thread state, and any other load-bearing mutable provider state. Expected-head protection alone is insufficient because base, diff, checks, reviews, or provider state can change while the candidate head remains fixed.

## Evidence states

- `VERIFIED`: current authoritative evidence supports the claim.
- `INFERRED`: evidence suggests the claim but does not prove it.
- `UNKNOWN`: required evidence has not been observed.
- `BLOCKED`: required authority or evidence cannot currently be obtained.
- `STALE`: evidence was previously valid but no longer matches current state.

## Status board

- `RED`: real failure or unresolved material blocker.
- `VERIFYING`: implementation exists; proof incomplete.
- `GREEN`: fresh machine evidence passes; authority may remain.
- `REVIEW`: independent review authority pending.
- `MERGED_UNVERIFIED`: integrated into the verified target branch; required runtime proof is still absent.
- `RUNTIME_VERIFIED`: merged artifact proven in the intended environment.
- `SUPERSEDED`: historical value preserved; no longer authoritative.
- `BLOCKED`: required external authority/evidence unavailable.

## Verification order

Use the cheapest valid proof first:

1. touched-area typecheck or lint;
2. focused unit/contract/integration test;
3. targeted Playwright for browser/UI/user-flow behavior when applicable;
4. exact-head CI;
5. provider/deployment/runtime readback.

The adaptive kernel may move a proof class earlier when repeated verified failures show the cheaper order is no longer the truthful fastest path. That learning never weakens the proof requirement.

## Merge liveness

A candidate is merge-eligible only while current evidence still matches its verified target/base/head/scope and required review/authority remains current. If the target/base moves, reacquire the focused change and rerun affected verification rather than inheriting old green.

Use expected-head protection for merge so a moved candidate cannot be integrated under stale authority, but still perform the final provider reread because expected-head does not detect every mutable authority input.

## Post-merge truth

After merge:

1. reacquire the verified target branch;
2. confirm the intended change is integrated;
3. rerun required post-merge checks;
4. obtain provider/runtime/browser evidence where applicable;
5. report `MERGED_UNVERIFIED` until required runtime proof exists;
6. promote to `RUNTIME_VERIFIED` only after the intended environment/path is actually proven;
7. capture the next exact gate.

## Sauce Guard / stop conditions

STOP or HOLD if the next step would expose or publish credentials, tokens, private prompts, raw private diffs, proprietary business logic, unreleased roadmap detail, internal evidence references, security-sensitive mechanics, private metrics, customer/family/user data, or other sauce-bearing material without an explicit public-safe contract.

## Report contract

```text
REALITY:
- repository / verified target branch / PR
- exact base SHA / exact candidate head SHA
- verified current state

FIX:
- exact files changed
- focused implementation / behavior change

PROOF:
- current exact-head tests/checks and evidence IDs
- Playwright result or explicit inapplicability
- provider/runtime evidence when applicable

RISK:
- unresolved risk / Red Team result / Sauce Guard or provider impact
- Future-Us pre-mortem finding when material

ROLLBACK:
- exact safe reversal

ADAPTIVE SIGNAL:
- surprise signal + adaptive action when material

NEXT GATE:
- one exact founder decision, authority gate, or next action
```