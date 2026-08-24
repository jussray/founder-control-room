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

### Freshness witness

`src/ultrathink-core/freshnessWitness.ts` is a provider-neutral classifier for bounded repository evidence. It cannot attest its own continued validity: evaluation requires a separately supplied at-use observation of current `main`, a full 40-character Git SHA, verified evidence references, strict timestamps, and an explicit expiry. SHA drift blocks the claim and expiry makes it stale. `VALID` means only that the supplied evidence remains current against that observation; it never grants merge, deploy, publish, provider, or other execution authority. Consequential action still requires the applicable authority lease and provider/runtime evidence.

Current implementation includes:

- provider-independent repository abstractions and guarded exact-head execution;
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
- freshness-aware federated truth receipts and a bounded Truth Lease contract for claims that can decay;
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