# Founder Control Room

> **Copyright © 2024–2026 Juss Ray. All rights reserved.**
> This is proprietary software. No license to use, copy, modify, distribute,
> sublicense, or create derivative works is granted. See [LICENSE](LICENSE).

Founder Control Room is a provider-independent founder operating plane for governed repository work, approvals, evidence, capability control, release control, production verification, rollback, founder-content distribution, and cross-project decision support.

It manages Se'kret Bip and related founder systems without making GitHub, Cloudflare, Supabase, n8n, Zapier, HubSpot, or another provider the product constitution.

## Current repository truth

**Current identity is resolved at use time only by a separately authorized live-provider revalidation.** A hard-coded SHA, date, PR body, issue comment, screenshot, provider result, or received webhook is historical evidence once the underlying state moves. A stored GitHub branch-head event is explicitly a last-observed source fact, not current-main proof.

For a present-tense repository claim:

1. resolve current `main` from GitHub;
2. bind repository evidence to that exact SHA;
3. distinguish repository, CI, provider, deployment, runtime, browser, account, publication, analytics, and human-outcome truth;
4. apply the applicable temporal gate or Truth Lease when the claim can decay; and
5. preserve older exact-version evidence as historical or superseded instead of silently promoting it back into current authority.

Exact SHAs belong in PRs, retained receipts, artifacts, incident records, and historical provenance. They do not automatically renew themselves as current truth after another merge.

Current implementation includes:

- provider-independent repository abstractions and guarded exact-head execution;
- a security-preserving GitHub ruleset update membrane for existing non-FCR named rulesets that reads current provider state before update and preserves top-level security monotonically: enforcement cannot be demoted, existing included branch refs cannot be narrowed away, and existing excluded refs remain preserved only when they do not still cover a caller-requested protected target; if a requested target remains covered by an exact, wildcard, or broad special-selector exclusion, the narrow compatibility update fails closed rather than reporting false protection; explicit bypass replacement also fails closed until a provider-aware bypass-authority contract can prove it is non-widening; requested required-status contexts may still narrow without silently dropping stronger provider-owned review, code-scanning, history, Copilot, deletion, force-push, existing bypass posture, or retained check-integration protections; new rulesets and FCR's constitutional `main` path retain their existing canonical semantics, and source logic does not itself prove live provider configuration;
- an obligation-aware work supersession contract in which stale/similar branches are only candidates, provider inventory and required residue must be fully and singly accounted, replacement provenance must remain explicit and acyclic, runtime-sensitive closure proof must be current-head-bound, and historical evidence remains recoverable;
- a canonical repository-provider deletion membrane: ambient `deleteBranch()` authority is intentionally absent until a future obligation-aware receipt reconciler exists and proves safe retirement before provider mutation;
- founder proof, idempotency/reservation, and rollback boundaries;
- an FCR-specific provider-grounded independent-review membrane before in-app provider integration;
- a canonical FCR founder-final merge policy that keeps deterministic independent review load-bearing, binds authenticated founder approval to the exact PR/base/head, and preserves the older server-owned semantic-review policy only for already-pinned compatibility paths;
- canonical capability governance through `.control/capability.json`;
- deterministic Cloudflare reasoning, request-trace/source contracts, and founder-gated Access recovery tooling whose source existence does not itself prove live provider configuration;
- a read-only Cloudflare hostname-inventory witness that discovers the reviewed zone's HTTP-relevant DNS names, classifies inventory/proxy drift, and simulates Request Trace per eligible proxied hostname without granting provider-mutation authority or persisting DNS targets/origin IPs;
- a secret-free exact-head Cloudflare bridge authority contract that is load-bearing inside CI / `Required Gate`, while live Cloudflare and GitHub provider state remain separate authority facts;
- a repository-owned Worker build authority membrane that binds native Workers Builds to the checked-out source SHA, permits only non-promoting native version uploads, and reserves production promotion for exact manual GitHub release authority without claiming live provider configuration;
- freshness-aware federated truth receipts and a bounded Truth Lease contract for claims that can decay; see the canonical [Freshness Witness contract](docs/FRESHNESS_WITNESS.md), which requires separately supplied at-use repository/main observation, independently bounded witness and observation lifetimes, and keeps `VALID` as evidence state only while Truth Lease / the applicable authority contract remains the consequential-action boundary;
- evidence-dependent consequential portfolio execution that binds founder authorization to the exact approved decision context and Truth Lease, then re-observes the lease dependencies at the declared use boundary so changed, stale, missing, or invalidated truth forces reconfirmation instead of execution;
- a production-specific Truth Lease composer that can bind one exact repository head to matching Cloudflare Worker/Pages runtime identity, Supabase production-state evidence, exact-runtime Playwright proof, and exact-head independent review, while failing closed when any required dependency is changed, stale, missing, or mismatched at use time;
- a typed [release-identity / rollout-coverage contract](docs/RELEASE_IDENTITY_AND_COVERAGE.md) that keeps binary version identity separate from privacy-safe aggregate traffic observation, with predeclared thresholds and no merge, deploy, or authorization effect;
- a project-bound, independently witnessed rollout-coverage ingress that accepts only Cloudflare aggregate `passed` observations, rejects self-attested/control-plane claims, wrong deployment targets, stale/out-of-order evidence, and expired coverage windows, and withholds current coverage until a read-through GitHub main revalidation supplies the matching identity;
- a durable founder-only **Founder Switchboard** with explicit BUILT / CONFIGURED / ACTIVE / PROVEN states and guarded authority modes;
- a privacy-safe public skill-testing evidence loop with `/devil` v1 structured receipts and aggregate analytics;
- first-party LinkedIn founder-content execution with exact Current You authority, FCR-owned one-shot approval storage/claim, temporal revalidation, and provider readback requirements;
- provider-neutral n8n founder-content orchestration contracts that keep contract capability separate from runtime configuration and final provider outcome;
- provider-neutral founder-content contracts under `tools/founder-content-contracts/`, with core approval storage, first-party execution, and temporal revalidation importing the canonical provider-neutral authorization contract directly while `tools/zapier/` remains a compatibility export surface for bounded connector and scheduling callers;
- founder-authenticated n8n/Buffer activation readiness that exposes configuration presence and provider allowlist state without returning webhook/token values, and promotes the canonical conveyor to `enabled-live-verified` only when a retained activation-probe receipt matches the deployed exact `GIT_SHA`; stale, missing, or unreadable proof remains non-live and fail-closed;
- bounded Zapier/Buffer integration where it still adds connector, scheduling, or fallback value without becoming publication authority;
- HubSpot integration boundaries that keep CRM metadata and external communication separate from repository truth and founder authority;
- a QuickScan v1 founder-gated prospect pipeline (evidence -> qualification -> founder-approved outreach action -> payment truth -> delivery) where a founder-pasted Stripe Payment Link's completion is trusted only through a signature-verified `checkout.session.completed` webhook (`POST /webhooks/stripe-quickscan`) with bounded replay-window and duplicate-event rejection; FCR never calls the Stripe API to create checkout and holds no Stripe secret key, only the webhook signing secret, and a manual payment record still requires founder-typed evidence text rather than being trusted on its own. Outreach recommendations remain founder-typed in v1: no Chief AI or Mirror Engine reasoning is currently wired into the QuickScan approval path, though the contract has a reserved slot for one. The revenue-recognized terminal state is evidence-gated the same way: `delivered` is reachable only through `POST /prospects/:id/delivery` with a Loom delivery URL, and the generic transition endpoint refuses to enter `qualified`, `payment_link_ready`, `payment_link_sent`, `paid`, or `delivered` directly, forcing the whole qualification -> payment-link -> paid -> delivered chain through its dedicated, evidence-checked routes instead of a bare `to` value. The webhook additionally checks the checkout session's amount and currency against the QuickScan price, and, when the founder configures `STRIPE_QUICKSCAN_PAYMENT_LINK_ID`, binds payment truth to that exact Payment Link so a same-price checkout completed on an unrelated Stripe product cannot satisfy it;
- desktop/mobile Playwright proof for scoped Control Room behavior; and
- bounded production/recovery workflows that do not silently inherit unrelated database, credential, publication, or provider-mutation authority.

Repository configuration, a green CI badge, a merge, a provider upload, a scheduler acceptance, or HTTP success does not by itself prove production or publication truth.

## Documentation truth gate

README files, current-state docs, PR descriptions, issues, AI operating contracts, and runbooks can affect future decisions. They are therefore part of the truth surface, not harmless commentary.

For truth-sensitive architecture, authority, provider, publishing, capability, workflow, or launch changes:

```text
change the operational truth
-> refresh README + applicable current-state docs in the same bounded PR
-> run Documentation Truth on the exact PR head
-> require Documentation Truth inside CI / Required Gate
-> merge only when the normal authority membrane is satisfied
-> run Documentation Truth again on the merged main transition
-> re-observe provider/runtime facts before reusing present-tense claims
```

Default-suite test discovery has a bounded evidence claim: a baseline entry means the file is excluded from the default `npm test` suite, not that it never ran in every CI workflow. The base-bound ratchet cannot accept newly excluded candidate tests and requires stale debt entries to be removed.

Historical material stays available as provenance. When it no longer describes current authority, mark it `HISTORICAL`, `SUPERSEDED`, `STALE`, `REVALIDATION_REQUIRED`, or point it to the current authority instead of deleting the record or letting it compete silently with fresh truth.

The verifier emits sanitized counts, domains, coverage, and failure reasons only. A truth-sensitive change must also update a structured documentation receipt that names each changed source path and a meaningful, path-bound invariant; punctuation-only, hidden-comment, whitespace-only, or pathless receipt touches cannot satisfy the gate. This establishes traceability and materiality, not independent semantic or live-provider proof, so human/security review remains required. The verifier does not store credentials, raw private evidence, raw diffs, private prompts, customer data, private metrics, or provider payloads. Analytics may observe documentation drift but never authorize, renew, or rewrite objective truth.

A docs-only truth-sync merge closes an existing drift cycle. Its post-merge receipt closes the transition without forcing another documentation edit merely because the merge commit SHA changed.

## Capability authority

`.control/capability.json` is the **canonical capability authority** for repository capability declarations.

`.control/capability.yaml` is a non-authoritative compatibility pointer. It intentionally carries no independent capability, health, deploy, rollback, proof, or verification state.

Keep these layers separate:

```text
canonical declaration
-> repository verifier proof
-> configured provider/tool state
-> active execution capability
-> observed outcome proof
```

The mutable capability ledger itself does not prove current-head CI, deployment, or runtime health. Read immutable current evidence for those claims.

## Independent review and founder-final merge truth

Founder Control Room's canonical in-app merge path requires exact provider PR identity, exact-head machine evidence, canonical diff/policy hashes, a passed exact-head deterministic independent-review witness, P2 blocking, an authenticated founder-final approval bound to the exact PR/base/head, and a last-moment head re-read before provider integration.

The deterministic review remains proposal-only and non-authorizing. For the canonical founder-final path, a deterministic GitHub Check Run witness is valid only when its exact head SHA, expected check identity, successful conclusion, and provider-backed Check Run App issuer all agree, and that issuer equals the server-owned numeric `GITHUB_APP_ID`; a missing or mismatched issuer fails closed. This source rule authenticates who produced the witness but does not prove that the live GitHub ruleset currently enforces the intended merge membrane.

The authenticated founder-final receipt supplies the final human authority only after independent proof is current. Founder self-approval is therefore **not** relabeled as independent review.

New founder-final approvals use a server-owned policy with zero required semantic humans, deterministic review required, P2 blocking, and `founderFinalApprovalRequired: true`. The older `FCR_TRUSTED_SEMANTIC_REVIEWER_IDS` policy remains compatibility-only for missions already pinned under the earlier human-semantic-review model.

This source/runtime membrane is **not proof of the live GitHub repository ruleset**. GitHub web/API merges, required approval counts, stale-review dismissal, last-push approval, thread-resolution rules, strict status freshness, and bypass actor/mode configuration are separate provider facts that require current GitHub readback.

A GitHub merge outside the in-app FCR execution path does not prove the FCR deterministic-review + founder-final contract was used.

### FCR GitHub App authority

Production GitHub authentication should prefer repository-scoped installation credentials minted from `GITHUB_APP_ID` and `GITHUB_PRIVATE_KEY`. The FCR App should be installed only on `jussray/founder-control-room` unless broader scope is separately reviewed.

For any active ruleset protecting `jussray/founder-control-room` `main`, the only permitted bypass actor is exactly the numeric App identity configured by trusted `GITHUB_APP_ID`. Missing, mismatched, caller-supplied alternative, or additional bypass integration IDs fail closed. `GITHUB_WEBHOOK_SECRET` separately authenticates the signed `/api/webhooks/github` event ingress. Secret values never belong in source, PR bodies, issue comments, logs, screenshots, browser bundles, or chat-visible documentation.

## Founder-owned progress publishing
