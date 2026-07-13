# Cloudflare Reasoning Contract

The Control Room treats Cloudflare as a replaceable execution and evidence provider, not as the owner of project truth or founder authority.

The command-shaped contract is:

```text
:cloudflare reason <project>
```

It runs the operating sequence:

```text
Goal → Redteam I → Lindy → L99 → Redteam II → OODA → Bill Gates
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

Every report contains:

1. **Reality** — observed desired, built, deployed, and healthy states.
2. **Redteam I** — challenges to the premise, including whether the failing path should exist.
3. **Lindy** — durable primitives: exact commits, one authority, immutable evidence, rollback, secret isolation.
4. **L99** — authority, provenance, state continuity, secret boundary, rollback, and drift.
5. **Redteam II** — attacks on the selected recovery plan.
6. **OODA** — observe, orient, decide, typed actions, and verification requirements.
7. **Bill Gates** — bottleneck, highest-leverage system change, standardization, and what not to scale yet.

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

When native Git deployment succeeds while an old token-upload workflow reports Cloudflare code `9109`, the reasoner should not immediately demand another token. It should first detect two deployment authorities and propose reducing the system to one authority through a separately approved repository change.

That is the same reasoning pattern that turned a supposed credential problem into a deployment-authority correction:

```text
Observe the contradiction
→ attack the assumption that the token path is required
→ inspect authority and provenance
→ choose one deployment authority
→ verify the exact deployed commit
→ retain rollback and approval boundaries
```

## Verification

```bash
npm test
npm run typecheck
npm run lint
npx playwright test e2e/cloudflare-reasoning.spec.ts
```

The browser/API suite verifies the public-safe contract, founder protection, absence of credential leakage, and absence of an accidental deployment endpoint. Unit tests verify exact-commit reasoning, stale evidence, duplicate authority, authentication failures, runtime failure, rollback preparation, and approval boundaries.
