# Founder OS Lab V1

## Reality

The `juss-chief-ai` prompt contract is already merged into Founder Control Room under `.claude/skills/juss-chief-ai/SKILL.md`. It defines the constitutional routing behavior, but a prompt file is not an executable company runtime.

Founder Control Room also already contains proof-led publishing, a first-party social validator, a Buffer content firewall, Zapier bridge contracts, approval policy, and evidence boundaries. Rebuilding those systems would create duplicate authority and drift.

## Purpose

`src/founder-os-lab/` is the first executable model of the AI company. It converts a founder goal into a deterministic route through Chief AI, one specialist skill, capability previews, authority state, Red Team findings, L99 state, and an OODA plan.

The lab exists to test organizational behavior before any employee can touch a provider.

## Isolation contract

V1 is **L0 simulation only**.

It has:

- no HTTP route;
- no browser surface;
- no Supabase query or write;
- no provider client;
- no Buffer or Zapier invocation;
- no GitHub mutation;
- no Cloudflare call;
- no Gmail or HubSpot call;
- no filesystem write;
- no environment-variable read;
- no secret access;
- no merge, deploy, publish, queue, or send authority.

Even when a founder approval reference is supplied, the lab sets `executionAllowed: false`. Approval can make a plan eligible for a future external executor, but it cannot execute inside the lab.

## First vertical path

```text
Founder goal
  -> juss-chief-ai
  -> proof-led-publishing
  -> existing first-party social validator
  -> Buffer handoff preview
  -> no provider call
```

This path reuses the existing social truth boundary. It can prove that finished copy contains required proof and metadata while still refusing to queue or publish it.

## Test matrix

The focused tests prove:

1. a valid social draft routes through `juss-chief-ai` and `proof-led-publishing`;
2. all side-effect flags remain false;
3. a payload containing approval-looking fields does not count as lab approval;
4. scoped approval is recognized without enabling execution;
5. prompt leakage fails closed;
6. merge planning remains preview-only even with approval;
7. identical input produces identical output.

The path-scoped workflow runs:

```bash
node scripts/verify-founder-os-lab-isolation.mjs
npx vitest run src/founder-os-lab/__tests__/engine.test.ts
npm run typecheck
```

The isolation verifier rejects provider clients, network calls, environment reads, database mutations, Express routes, filesystem/network/child-process imports, and live social-adapter execution inside the lab path.

## Red Team

### Why this should exist

A broad autonomous runtime would compound authority mistakes faster than it compounds founder value. A pure lab lets the organization model be tested as data before connecting tools.

### Primary failure modes

- treating the merged prompt as proof that a runtime exists;
- treating an approval ID as proof that an action executed;
- importing a live provider client into a preview adapter;
- treating successful content validation as a Buffer or platform receipt;
- expanding from one vertical slice into a second orchestration system.

## Graduation gates

A capability may leave the lab only through a separate focused change that provides:

1. one named adapter and one target provider;
2. explicit read or write authority;
3. exact input and output schemas;
4. idempotency and replay behavior;
5. sanitized audit evidence;
6. failure and timeout classification;
7. rollback and revocation steps;
8. focused contract tests;
9. real-path evidence when user-facing behavior changes;
10. no success claim without a provider or destination receipt.

The first graduation candidate should be **one review-only Buffer draft adapter**, not a general autonomous executor.

## Rollback

Revert the lab directory, isolation verifier, workflow, and this document. No provider, account, credential, database, post, email, deployment, or repository state outside the branch requires cleanup.
