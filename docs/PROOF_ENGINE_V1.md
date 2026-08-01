# Founder Proof Engine V1

## Purpose

The Proof Engine converts provider evidence into a founder-readable launch readiness snapshot. It does not perform deployments, legal approvals, database changes, or merges. It reads sanitized evidence already recorded in `project_events`.

## Endpoint

`GET /dashboard/proof-engine?projectSlug=<slug>`

The route is founder-gated and returns the newest `proof_signal` for each provider and label.

## Event contract

Provider adapters publish a `project_events` row with:

```json
{
  "event_type": "proof_signal",
  "metadata": {
    "id": "github:main-ci",
    "provider": "github",
    "label": "Main branch CI",
    "status": "verified",
    "evidence": ["commit:<40-char-sha>", "workflow:<run-id>"],
    "checkedAt": "2026-08-01T01:00:00.000Z"
  }
}
```

Allowed providers:

- `github`
- `supabase`
- `cloudflare`
- `playwright`
- `legal`

Allowed statuses:

- `verified`
- `warning`
- `blocked`
- `unknown`

## Scoring

- verified: 1.0
- warning: 0.5
- unknown: 0.25
- blocked: 0

The score is the rounded average across current signals.

Launch status:

- `ready`: score is 100 and no blocker exists
- `conditional`: evidence exists but is incomplete or warning-bearing
- `blocked`: at least one current signal is blocked

A healthy provider connection is not proof that its product surface is launch-ready. For example, an active Supabase project with unresolved security advisor warnings must be represented as `warning` or `blocked`, not `verified`.

## Product design

The Control Room card should show:

1. readiness percentage
2. overall state
3. one row per provider
4. exact evidence references
5. blocker copy in plain language
6. evidence freshness
7. no decorative green state without evidence

Required UI states:

- loading
- no evidence yet
- conditional readiness
- blocked readiness
- ready
- provider fetch error

## Provider mapping

### GitHub

Evidence includes exact commit SHA, required workflow conclusions, review state, and merge state.

### Supabase

Evidence includes project health, migration presence, Edge Function deployment, advisor status, and controlled runtime checks. Project health alone is insufficient.

### Cloudflare

Evidence includes exact deployed commit, service name, environment, deployment conclusion, and public route check.

### Playwright

Evidence includes desktop/mobile route coverage, screenshot or trace artifact, tested commit, and conclusion.

### Legal

Evidence includes resolved legal entity/contact fields and retained executed agreements. Repository placeholders or dashboard checkboxes are not proof.

## Rollback

Revert the focused Proof Engine PR. No provider state or database schema is changed by V1.
