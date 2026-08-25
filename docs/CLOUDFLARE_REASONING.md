# Cloudflare Reasoning Contract

The Control Room treats Cloudflare as a replaceable execution and evidence provider, not as the owner of project truth or founder authority.

The command-shaped contract is:

```text
:cloudflare reason <project>
```

It runs the implementation sequence:

```text
Goal → Reality → Redteam I → Lindy → L99 → Redteam II → OODA → Bill Gates → Elon Musk → Proof → Rollback → Next gate
```

The engine is deterministic. It does not call a model, execute Wrangler, deploy a Worker, change DNS, rotate secrets, or roll back production.

## Why this exists

A Cloudflare incident can present several facts that look contradictory:

- a Worker build succeeds;
- a Pages check remains stale or pending;
- the public site is serving a different commit;
- a token-based deployment fails with an authentication error;
- native Git integration is already deploying correctly;
- runtime health still fails after a successful build.

The engine separates those states rather than compressing them into “Cloudflare is broken.” That sentence is emotionally satisfying and operationally useless.

## Temporal truth and intent drift

A statement can be accurate when recorded and wrong when reused later. The Control Room must therefore distinguish five lanes instead of flattening them into one memory value:

1. **Observed** — what repository, provider, runtime, or human-outcome evidence says now. Provider/runtime facts require fresh at-use evidence under the Truth Lease contract.
2. **Safety invariant** — what must remain true regardless of current preference. For the FCR Worker, native Worker Git may not promote production outside the governed deploy authority.
3. **Allowed safe states** — states that satisfy the invariant. `disconnected` and `non-promoting` are both safe with respect to duplicate production promotion.
4. **Current desired state** — the founder's current product/architecture preference. The current Worker Git preference is connected but non-promoting, with `npx wrangler versions upload` as the deploy command.
5. **Historical decision** — what was once recommended or preferred. A historical disconnect recommendation remains useful provenance and may still describe a safe fallback, but it is not current intent and cannot authorize a provider change.

This separation fixes the failure mode where “disconnect Worker Git Builds” was once a defensible safe recommendation and later got repeated as though it were the current architecture plan. The problem was not that the old statement had never been true. The problem was that **allowed safe state**, **current preference**, and **execution authority** had been collapsed.

The machine-readable source for this specific topology is `config/cloudflare-worker-git-authority-policy.json`. It is a desired-state policy only. It cannot authorize a Cloudflare mutation. Founder preference may persist until explicitly superseded so the product can remember what the founder wants, while any consequential provider mutation still requires a fresh Current You approval. Conversely, provider/runtime facts do not persist merely because the founder remembers them; they must be re-observed at the boundary where they are used.

The Worker Git authority receipt exposes the same Product Design hierarchy explicitly:

```text
OBSERVED → SAFETY → ALLOWED → DESIRED → AUTHORITY → DRIFT
```

Analytics may count the resulting state and drift classification, but analytics is observation-only. It cannot infer a new desired state, authorize a mutation, or turn historical frequency into founder intent.

## Input contract

The reasoner accepts sanitized, timestamped observations such as:

- Worker deployment status and commit SHA;
- Pages deployment or release-marker status and commit SHA;
- runtime health status;
- deployment authority (`native_git`, `token_upload`, or `manual`);
- route and DNS state;
- credential error codes without secret values;
- desired commit and project identifiers.

Raw provider payloads, tokens, private keys, service-role values, user content, and founder identity are outside the reasoning contract.

## Output contract

Every version `1.1.0` report contains:

1. **Reality** — observed desired, built, deployed, and healthy states.
2. **Redteam I** — challenges to the premise, including whether the failing path should exist.
3. **Lindy** — durable primitives: exact commits, one authority, immutable evidence, rollback, secret isolation.
4. **L99** — authority, provenance, state continuity, secret boundary, rollback, and drift.
5. **Redteam II** — attacks on the selected recovery plan.
6. **OODA** — observe, orient, decide, typed actions, and verification requirements.
7. **Bill Gates** — bottleneck, highest-leverage system change, standardization, and what not to scale yet.
8. **Elon Musk** — questioned requirement, deletion target, simplified system, accelerated feedback loop, and automation boundary.

The Elon pass is not permission to delete guardrails. It may delete duplicated deployment paths, stale assumptions, and unnecessary workflow layers. It may not delete founder approval, privacy boundaries, auditability, rollback, or evidence requirements.

Possible outcomes:

- `verified` — Worker, Pages, and runtime evidence are fresh and agree with the desired commit;
- `observing` — a current deployment is still pending;
- `degraded` — evidence is missing or stale;
- `blocked` — a fresh failure, commit mismatch, or conflicting deployment authority exists.

## Authority model

The reasoner may automatically:

- read sanitized evidence;
- classify drift;
- identify missing evidence;
- record a sanitized reasoning event;
- recommend read-only diagnostics.

The reasoner may not automatically:

- create an operational branch;
- merge;
- deploy;
- roll back;
- rotate or replace secrets;
- change DNS or routes.

Those remain separate founder approval gates. Approval never carries forward.

## HTTP surfaces

### Public-safe contract

```http
GET /cloudflare/contract
```

Returns identifiers and policy metadata only. It contains no credentials, project secrets, founder identity, or private product content.

### Founder-protected reasoning

```http
POST /cloudflare/:slug/reason
Authorization: Bearer <founder-session>
Content-Type: application/json

{
  "desiredCommit": "optional exact commit SHA",
  "maxEvidenceAgeMinutes": 20
}
```

The endpoint reads the Control Room’s own normalized operational tables:

- `project_connections`;
- `provider_observations`;
- `releases`;
- `project_events`;
- `project_manifests`.

It writes one sanitized `cloudflare_reasoning_completed` event. If that audit write fails, the endpoint fails closed rather than presenting an unaudited result as trustworthy.

## Recovery example

When native Git deployment succeeds while an old token-upload workflow reports Cloudflare code `9109`, the reasoner should not immediately demand another token. It should first detect two deployment authorities and propose reducing the system to one production authority through a separately approved repository or provider change.

For Founder Control Room specifically, a native Worker Git trigger may remain connected when it is non-promoting. A provider read-back showing `wrangler versions upload` satisfies the current desired topology; a disconnected trigger satisfies the safety invariant but is reported as `safe-but-not-current`; a production-capable `wrangler deploy` trigger is an authority conflict.

The complete reasoning path becomes:

```text
Observe the contradiction
→ separate provider fact from remembered architecture preference
→ attack the assumption that every safe fallback is current intent
→ inspect authority and provenance
→ identify the bottleneck and leverage point
→ preserve one production promotion authority
→ keep useful non-promoting evidence paths when they match current intent
→ verify the exact deployed commit and runtime health
→ retain rollback and approval boundaries
→ automate only repeated read-only evidence refresh
```

## Read-only hostname inventory and Request Trace

The manual `Cloudflare Worker Git Authority Audit` has a bounded provider-observation lane for FCR hostnames. Its primary Worker Git authority readback depends only on the dedicated read-only Workers Builds user token. DNS inventory and Request Trace credentials are optional enrichment: when either is unavailable, hostname/trace enrichment is skipped and remains `UNKNOWN`, but that absence must not suppress the core Worker Git authority receipt. If optional enrichment is attempted and then fails because credentials are malformed, provider reads are rejected, the request method is unsafe, or the returned provider evidence is invalid, that failure remains visible inside the bounded `requestTrace` evidence lane but cannot downgrade or upgrade the snapshotted core Worker Git authority verdict.

Its source contract:

- resolves the reviewed `foundercontrolroom.org` zone through a dedicated read-only DNS inventory authority when that enrichment credential is available;
- paginates the zone's A, AAAA, and CNAME records and derives in-zone HTTP-relevant hostnames without retaining DNS `content`, origin IPs, or target values;
- compares the discovered inventory with `config/cloudflare-request-trace-host-policy.json`;
- classifies new hosts, missing required hosts, proxy-state drift, wildcard hosts, DNS-only hosts, and directly traceable proxied hosts;
- runs Cloudflare Request Trace independently for each eligible proxied hostname through a separate read-only Request Tracer authority when both enrichment credentials are available; and
- writes only the sanitized inventory/trace receipt, including an inventory hash and bounded trace summaries.

The workflow intentionally requires its requested SHA to equal current `main` before provider observation. A PR source check can prove the audit code and contract, but it cannot prove current Cloudflare hostname inventory. Until the manual workflow runs successfully against an exact still-current main SHA, live hostname/proxy/trace state remains `UNKNOWN` rather than inferred from repository configuration.

The receipt preserves `requestSimulation: true`, `runtimeShaVerified: false`, and `canAuthorizeProviderMutation: false`. It therefore cannot authorize or prove a DNS mutation, Access change, route change, Worker deployment, credential change, or production release. The workflow may restore the top-level core `ok`/`error` verdict after optional enrichment, but it may not create a successful core verdict when the core receipt is absent or failed.

## Served remote read MCP boundary

The canonical `founder-control-room` Worker serves a bounded remote read-only MCP endpoint at `POST https://api.foundercontrolroom.org/mcp/read`. Repository configuration binds its project scope to exactly `chief-ai-machine,founder-control-room` through `FCR_REMOTE_MCP_READ_PROJECTS` and names `FCR_REMOTE_MCP_READ_TOKEN` as the dedicated bearer-secret interface.

This source configuration is deliberately non-authorizing: it cannot prove that the secret has been installed, that the deployed Worker is running this exact source, or that the endpoint is reachable. The route must fail closed when its required token or server-held project scope is unavailable, and its two exported tools remain read-only (`list_read_servers` and `invoke_read_tool`) behind the existing MCP registry/policy boundary. A secret value must never be committed to Wrangler, documentation, logs, screenshots, issues, or retained proof.

Expanding this remote grant beyond Chief AI + Founder Control Room is a separate authority change; it must not be inferred from the broader portfolio registry or from another MCP credential.

## Project-scoped outbound email

Cloudflare outbound email is a capability boundary, not a global portfolio transport. Founder Control Room's canonical Worker uses the `FCR_EMAIL` send binding and pins the sender identity to `welcome@api.foundercontrolroom.org`; the application wrapper does not accept caller-controlled `from`. Other projects do not inherit that binding merely because they share the same founder or Cloudflare account.

Repository configuration can prove the desired binding name and sender restriction. It cannot prove Cloudflare has onboarded the sender domain, the deployed Worker currently exposes that binding, or a message was accepted/delivered. Those claims require fresh provider/runtime evidence and must remain separate from source truth.

## Worker build authority membrane

`wrangler.worker.toml` runs `scripts/verify-worker-build-authority.mjs` as its custom Worker build hook. The hook is a repository-side fail-closed membrane, not a provider mutation authority.

For native Cloudflare Workers Builds, the membrane requires the provider-reported commit SHA to equal the checked-out Git source, requires branch/build UUID evidence, and permits only the non-promoting `wrangler versions upload` command. A native `wrangler deploy` is rejected before promotion with `NATIVE_WORKER_GIT_PROMOTION_BLOCKED`.

For GitHub Actions, production promotion is recognized only for the manual `Deploy` or `FCR Worker Reconcile` workflow-dispatch lanes when the checked-out SHA equals the exact GitHub workflow SHA. Ordinary CI remains verification-only. The emitted `fcr/worker-build-authority-receipt@v1` is redacted build evidence and explicitly cannot authorize provider mutation.

This source membrane does not prove the current Cloudflare Workers Builds dashboard configuration, custom-domain routing, active deployment, or runtime SHA. Those remain separate provider/runtime readback gates.

## Verification

```bash
npm test
npm run typecheck
npm run lint
npx playwright test e2e/cloudflare-reasoning.spec.ts
```

The browser/API suite verifies the public-safe contract, founder protection, absence of credential leakage, presence of the implementation stack, and absence of an accidental deployment endpoint. Unit tests verify exact-commit reasoning, stale evidence, duplicate authority, authentication failures, runtime failure, rollback preparation, first-principles deletion/simplification output, and approval boundaries.
