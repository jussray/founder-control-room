# Juss AI Company Lab

Status: `LAB_ONLY`

This directory is an isolated simulation environment for testing the proposed AI-company architecture without touching production systems, credentials, customer data, publishing accounts, repositories, deployments, or external providers.

## Purpose

Test whether a governed group of specialist agents can reliably transform a synthetic founder event into:

1. a reality assessment;
2. a publishability decision;
3. platform-specific draft packages;
4. fake transport receipts;
5. a traceable learning record.

The lab is not a production runtime and must never be described as one.

## Isolation boundary

The lab has these hard constraints:

- synthetic data only;
- no imports from Founder Control Room production modules;
- no environment variables or secrets;
- no outbound network APIs;
- no Supabase, GitHub, Cloudflare, Buffer, HubSpot, Gmail, or social-platform clients;
- no filesystem writes from runtime code;
- no deployment configuration;
- no live publishing;
- no production database access;
- no user, customer, teen, family, journal, voice, media, financial, credential, or private project data;
- deterministic fake adapters only;
- read-only CI permissions;
- promotion by a reviewed contract, never by merging the entire lab into production unchanged.

## Architecture under test

```text
Synthetic Event
    ↓
Reality Agent
    ↓
Governance Agent
    ↓
Story Agent
    ↓
Fake Transport Adapter
    ↓
Receipt + Trace
    ↓
Learning Agent
```

Every agent is a deterministic function with explicit input and output. There are no model calls in v0. This allows the authority boundaries and state machine to be tested before introducing probabilistic behavior.

## Safe commands

```bash
npm --prefix labs/ai-company run verify
```

This runs:

- the isolation scanner;
- deterministic behavior tests;
- failure-path tests;
- approval-gate tests;
- fake-transport receipt tests.

## Promotion gate

Nothing in this lab may connect to a real provider until all of the following are true:

1. isolation verification passes on the exact branch head;
2. synthetic scenario tests cover blocked, draft, approval-required, and authorized states;
3. no source file imports production runtime code;
4. no network, credential, or secret primitive exists in lab runtime code;
5. the proposed production interface is extracted as a small reviewed contract;
6. a separate adapter is implemented behind that contract in Founder Control Room;
7. the adapter defaults to dry-run or draft-only;
8. founder approval is required for every queue, publish, send, spend, or external mutation;
9. real receipts are required before any external action is called complete;
10. Playwright proof is added before any founder-facing UI is promoted.

## Rollback

Delete or abandon the `lab/ai-company-v0` branch. No production state, provider account, external message, credential, or customer record is touched by this lab.
