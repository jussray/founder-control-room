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

## Public Access recovery evidence boundary

The founder-gated `FCR Access Front Door Recovery` workflow is a separate inspection/recovery authority from the read-only reasoning engine. Its public evidence path is intentionally narrower than its private working files.

The recovery workflow must:

- independently reduce an unsafe or malformed requested head to literal `UNKNOWN` before any always-path publication;
- treat both Access-provider and browser receipt files as untrusted streams;
- parse each receipt stream with slurp semantics, require exactly one JSON document, then validate only `.[0]` against bounded field/type/enum allowlists;
- make the public projection independently slurp and project only `.[0]`, so a multi-document stream cannot fan out after validation;
- suppress raw producer stdout/stderr and never persist raw Access/browser receipt JSON as public evidence;
- keep raw browser origin/error strings, Access application names/objects, free-form blocker/next-action text, tokens, provider payloads, and secret-bearing values out of public issue comments, job summaries, and retained public artifacts; and
- persist one sanitized Markdown receipt for the founder control issue, Actions summary, and artifact. Apply-mode approval references are validated but represented in the recovery authority summary only by a SHA-256 receipt; read-only runs reject an approval reference.

These controls prove a **repository evidence-sanitization contract**, not live Cloudflare state. A green workflow or sanitized receipt cannot by itself prove current Access configuration, credential permissions, front-door reachability, or runtime identity. Those remain provider/runtime observations with their own freshness requirements.

## Verification

```bash
npm test
npm run typecheck
npm run lint
npx playwright test e2e/cloudflare-reasoning.spec.ts
```

The browser/API suite verifies the public-safe contract, founder protection, absence of credential leakage, presence of the implementation stack, and absence of an accidental deployment endpoint. Unit tests verify exact-commit reasoning, stale evidence, duplicate authority, authentication failures, runtime failure, rollback preparation, first-principles deletion/simplification output, and approval boundaries.
