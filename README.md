# Founder Control Room

> **Copyright © 2024–2026 Juss Ray. All rights reserved.**
> This is proprietary software. No license to use, copy, modify, distribute,
> sublicense, or create derivative works is granted. See [LICENSE](LICENSE).

Founder Control Room is the provider-independent founder operating plane for governed portfolio work: repository truth, proposals, approvals, evidence, capability control, release control, production verification, rollback, founder-content execution, and cross-project decisions.

GitHub, Cloudflare, Supabase, n8n, Zapier, HubSpot, Shopify, and other providers may supply execution or evidence. None of them becomes the product constitution.

## Read this README as a truth surface

Founder Control Room separates four states that are easy to blur together:

```text
SOURCE IMPLEMENTED
-> the reviewed contract/code/tests exist

CONFIGURED
-> required provider/runtime bindings were independently observed

ACTIVE
-> the intended live execution path was exercised

PROVEN
-> exact-version evidence supports the claimed outcome
```

`SOURCE IMPLEMENTED` is not a weaker spelling of `PROVEN`. A source file, green test, merge, provider upload, scheduler acknowledgement, or HTTP 200 proves only the layer it actually observed.

**Current identity is resolved at use time** from the applicable authority. A hard-coded SHA, PR body, issue comment, screenshot, webhook, workflow result, or provider response becomes historical evidence when its load-bearing state moves.

For a present-tense claim:

1. resolve the current repository/default-branch identity;
2. bind source and CI evidence to that exact identity;
3. keep repository, provider, deployment, runtime, browser, database, publication, analytics, and human-outcome truth separate;
4. use the applicable freshness gate or Truth Lease when the claim can decay; and
5. mark predecessor evidence `HISTORICAL`, `STALE`, `SUPERSEDED`, `UNKNOWN`, or `BLOCKED` instead of silently carrying it forward.

Exact SHAs belong in receipts, PRs, artifacts, incidents, and provenance. The README deliberately does not freeze one SHA as permanent “current truth.”

## What is implemented in source now

### Repository and mission control

FCR models projects, proposals, missions, exact refs, verification runs, evidence, approval state, and bounded repository operations behind provider-neutral interfaces.

### PR continuity

The repository has machine-enforced PR continuity. Eligible same-repository branches may roll forward when their live base moves, but every head movement creates a new proof subject.

```text
main/base moves
-> trusted continuity re-observes the PR graph
-> eligible branch rolls forward conflict-free
-> predecessor CI/review/runtime/provider/Playwright proof expires
-> exact successor proof reruns
```

Continuity never rolls founder approval, merge authority, deploy authority, publication authority, provider-mutation authority, spend, deletion, or destructive authority forward automatically. **Proof rollover is allowed only by re-verification. Authority rollover is not.**

See [`docs/PR_CONTINUITY.md`](docs/PR_CONTINUITY.md).

### Repository federation and StoryEngine

FCR can issue a separately approved, bounded product-build directive to a product-owned control-room contract. The current StoryEngine federation seam is intentionally narrow:

- exact target: `jussray/StoryEngine` / `l99` / `storyengine-control-room`;
- required proof includes `node-test` and `playwright`;
- the canonical directive is sent at the request-body root;
- FCR validates the peer contract before dispatch;
- StoryEngine validates independently;
- FCR binds exact peer runtime identity before and after execution;
- the returned receipt must bind to the exact directive; and
- the receipt cannot claim merge, deploy, or provider mutation.

Source wiring and unit tests do **not** prove the current peer runtime is reachable or that the federation loop is green for the current FCR head. That requires exact-head runtime/browser evidence.

The StoryEngine peer pin is an evidence identity, not a durable alias for “current StoryEngine.” If the separately versioned StoryEngine carrier moves, earlier FCR Playwright green remains historical for its pinned peer. FCR must bind a separately exact-head-proven StoryEngine successor and rerun the complete FCR → StoryEngine → receipt → FCR browser/runtime witness before making a current federation claim.

See [`docs/REPOSITORY_FEDERATION.md`](docs/REPOSITORY_FEDERATION.md).

### Jira work automation

FCR owns the bounded Jira source contract, authenticated service ingress, and importable n8n workflow artifact. The artifact ships inactive and carries no Jira credential authority.

Current truthful status is:

**source implemented / provider activation unverified**

Do not call the lane live until Jira Automation, n8n, credentials, provider serialization or durable dedupe, exact deployed FCR identity, one controlled mutation, exact receipt reconciliation, and independent Jira readback are proven.

Keep `N8N_JIRA_AUTOMATION_ENABLED=false` until that activation gate is satisfied.

See [`docs/JIRA_AUTOMATION.md`](docs/JIRA_AUTOMATION.md).

### GitHub merge governance

The repository contains FCR's founder-final merge policy, deterministic independent-review contract, exact-head evidence checks, provider-backed GitHub App witness rules, thread resolution, CodeQL floor, and stale-proof handling.

Source policy is not live GitHub provider truth. Current rulesets, bypass actors, required checks, native review settings, and provider enforcement require fresh GitHub provider readback before a merge decision.

Founder self-approval is not relabeled as independent review. The canonical path keeps deterministic independent review and authenticated exact-candidate founder-final approval separate.

For Chief governance, FCR contains a **read-only trusted observation and verification boundary** pinned to `jussray/chief-ai-machine` and Chief ruleset IDs `20818149` and `21261587`. It uses the repository-scoped FCR GitHub App installation-token path rather than caller-supplied PAT/token authority, preserves required-check `integration_id` producer identity, requires complete bypass and deployment readback, and fingerprints the provider observation. Under the current founder decision, ruleset `20818149` is accepted exactly as observed when it preserves zero bypass actors, its approved source checks, `Cloudflare Production`, `proofmode-access-admin`, and the unbound reserved candidate runtime context. A compliant observation returns `NO_CHANGE_REQUIRED` with `mutation:null`; drift blocks verification rather than producing a desired-state rewrite. This boundary never grants provider mutation, merge, deploy, or execution authority.

See [`docs/FOUNDER_MERGE_AUTHORITY.md`](docs/FOUNDER_MERGE_AUTHORITY.md).

### Capability authority

`.control/capability.json` is the **canonical capability authority** for repository capability declarations.

`.control/capability.yaml` is a compatibility pointer, not a second source of capability, deploy, runtime, health, or rollback truth.

Keep the layers separate:

```text
canonical capability declaration
-> repository verifier proof
-> provider/tool configuration
-> active execution capability
-> observed outcome proof
```

### Founder-content execution

The founder-content architecture separates story, authority, transport, and outcome:

```text
verified evidence
-> Chief proposes public-safe copy
-> Sauce Guard removes private machinery
-> temporal claim classification
-> authenticated Current You confirms exact copy
-> FCR persists one-shot approval authority
-> execution-time revalidation
-> first-party LinkedIn where configured and proven
   or provider-neutral n8n / bounded connector route where applicable
-> provider readback
-> FCR outcome receipt
-> observation-only analytics
```

A draft, provider acceptance, or n8n execution is not publication truth. **Provider readback** is the terminal external-state evidence for the route that actually ran.

Investor email is a separate authority class and must not auto-send without the applicable policy, recipient-specific qualification, and send authority.

### Cloudflare and production release

Canonical source topology is:

```text
foundercontrolroom.org
  -> Cloudflare Pages project: founder-control-room
  -> browser/static assets
  -> dynamic API through the Pages `FCR_API` Service Binding in source

api.foundercontrolroom.org
  -> canonical Worker: founder-control-room
```

Source dependence on that topology is not proof the live provider is configured correctly.

Production does not deploy merely because `main` moved or a Cloudflare build succeeded. A production claim remains incomplete until the authorized lane proves, for one exact candidate:

- current deployment authority;
- required deployment configuration/bindings;
- provider mutation success for the authorized scope;
- migration evidence only when database mutation is actually in scope;
- canonical Worker identity;
- `/health` and `/version` identity;
- Pages/API routing and service identity;
- required runtime/browser proof; and
- rollback ownership.

A production-specific Truth Lease composes already-authoritative observations. It does not manufacture missing provider/runtime facts.

The privileged post-Deploy Playwright witness is an **independent verifier**, not an executor for the Deploy-run checkout. It must run only for a successful `workflow_dispatch` Deploy run from `main`, execute trusted witness source, and treat the Deploy run SHA only as release evidence to compare with the deployed Worker and public browser/runtime identity. A `workflow_run` SHA must never become executable authority merely because the upstream workflow succeeded.

### Evidence Trust Plane

The Evidence Trust Plane keeps observation, provider readback, evidence validity, freshness, and action ceilings separate.

Current source includes receipt/evaluator foundations that can classify whether exact GitHub evidence is suitable to prepare merge review. This does **not** claim durable evidence persistence is universally wired. `ledgerState` remains supplied state where a separately reviewed persistent writer/store has not been proven.

Even a valid current receipt cannot by itself authorize merge, deploy, production promotion, issue closure, secret mutation, policy mutation, billing, publication, or deletion.

### Guarded terminal

The terminal executes only registered commands against an exact verified checkout. It does not accept arbitrary shell strings, caller-selected executables, redirections, pipes, or unreviewed environment mutation.

A terminal result is verification evidence only for the command and exact checkout that actually ran.

### MCP and provider bridges

FCR can declare and govern bounded MCP/provider capabilities, including the source contract for a read-only FCR MCP bridge. Repository declarations prove wiring only. Live secret presence, provider authentication, endpoint health, deployed runtime identity, and mutation authority require separate current evidence.

## Data boundary

Founder Control Room uses its own data/control boundary. It must not become a broad back door into Se'kret Bip private user data or another product's customer data.

Repository manifests, operational packets, analytics, receipts, and public content should minimize retained data and keep credentials, private prompts, raw diffs, private provider payloads, customer/private data, and proprietary mechanics out of public surfaces.

## Authority model

| Action | Required authority |
|---|---|
| Read project/evidence | Founder-authenticated or explicitly public-safe read |
| Run bounded verification | Applicable founder/repository authority |
| Create branch | Separate repository write authority |
| Merge through FCR | Exact-head machine proof + deterministic independent review + authenticated exact-candidate founder-final approval + repository authority |
| Merge through live GitHub | Separate live GitHub ruleset/provider authority and fresh readback |
| Deploy / mutate production | Separate exact production authority |
| Database migration | Separate migration/database authority |
| Credentials / secrets | Separate credential authority |
| Publication | Exact route-specific Current You authority + FCR one-shot approval claim + provider outcome proof |
| Investor email | Applicable policy + recipient qualification + send authority |
| Billing / destructive action | Separate exact authority |
| Rollback | Separate rollback authority |

No approval silently carries into another authority class.

## Documentation truth gate

README files, current-state docs, PR descriptions, issues, AI operating contracts, and runbooks are part of the control surface when humans or agents use them to make decisions.

For truth-sensitive architecture, provider, evidence, workflow, capability, publishing, security, or launch changes:

```text
change operational truth
-> refresh README + applicable current-state docs in the same bounded PR
-> update docs/DOCUMENTATION_TRUTH_RECEIPT.json with path-bound invariants
-> run Documentation Truth on the exact head
-> require Documentation Truth inside CI / Required Gate
-> merge only through the normal authority membrane
-> re-observe provider/runtime facts after integration before reusing present-tense claims
```

When a newer fingerprint contradicts an older present-tense statement, replace or classify the stale statement instead of leaving competing “current” truths.

Documentation Truth proves documentation coverage/materiality. It does not independently prove provider configuration, deployment, browser behavior, security review, publication, or human outcome.

See [`docs/TRUTH_DECAY_AUDIT.md`](docs/TRUTH_DECAY_AUDIT.md).

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Public-safe configuration may live in `.env.example`. Secret values do not belong in source, logs, retained artifacts, browser bundles, public posts, PR bodies, issue comments, or chat-visible documentation.

## Operator contracts

- [`GLOBAL_AI.md`](GLOBAL_AI.md) — provider-neutral founder operating contract
- [`AGENTS.md`](AGENTS.md) — repository entry contract
- [`CHATGPT.md`](CHATGPT.md) — ChatGPT overlay
- [`CLAUDE.md`](CLAUDE.md) — Claude overlay
- [`PERPLEXITY.md`](PERPLEXITY.md) — Perplexity overlay
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — architecture
- [`docs/PR_CONTINUITY.md`](docs/PR_CONTINUITY.md) — branch/head proof rollover law
- [`docs/REPOSITORY_FEDERATION.md`](docs/REPOSITORY_FEDERATION.md) — repository and bounded product-build federation
- [`docs/JIRA_AUTOMATION.md`](docs/JIRA_AUTOMATION.md) — Jira/n8n bounded automation and activation gate
- [`docs/FOUNDER_MERGE_AUTHORITY.md`](docs/FOUNDER_MERGE_AUTHORITY.md) — repository integration authority
- [`docs/TRUTH_DECAY_AUDIT.md`](docs/TRUTH_DECAY_AUDIT.md) — truth aging and documentation drift
- [`docs/PUBLIC_COMMUNICATION_TRUTH_CONTRACT.md`](docs/PUBLIC_COMMUNICATION_TRUTH_CONTRACT.md) — public truth and Sauce Guard
- [`docs/PROVIDERS.md`](docs/PROVIDERS.md) — provider handoffs
- [`docs/CLOUDFLARE_REASONING.md`](docs/CLOUDFLARE_REASONING.md) — Cloudflare reasoning/recovery
- [`docs/GOALFIX_EXECUTION_WORKFLOW_V2.md`](docs/GOALFIX_EXECUTION_WORKFLOW_V2.md) — canonical repair/verification workflow

Provider overlays may become stricter. They do not become competing constitutions or expand their own authority.