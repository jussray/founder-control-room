# HubSpot Read-Only Registry Preflight

Date: 2026-08-17
Initial base: `36530a2222b4504b4295f377f3fa5c1e6b18f678`
Current main integrated: `ea2a301b96bb15d13fa6c231063a59ab9b179532`
Branch: `feat/hubspot-readonly-registry-preflight`

## Goal

Give Founder Control Room a first-party, fail-closed way to recognize the audited founder-project records in HubSpot before any CRM mutation path exists.

## Reality

- Connected HubSpot account: `246754542`.
- The founder-project portfolio currently contains ten explicit HubSpot Deal records.
- HubSpot is already represented in `src/lib/pluginCenter.ts` with separate read and critical CRM-mutation authority.
- The current portal exposes a Sales Pipeline, not a project-native pipeline or project object.
- Deal `pipeline` and `dealstage` therefore cannot be treated as founder-project status.
- The repository already permits `hubspot` as a connection type, but that provider-name allowlist does not itself create a connection, credential, runtime client, or mutation authority.
- Local `hs account current` proof remains a separate workstation evidence lane from connector-backed HubSpot account proof.
- The branch has incorporated current `main` rather than relying on the earlier release-witness base.

## Red Team I — premise

The integration should exist only if it narrows ambiguity rather than adding another source of authority.

The unsafe version would discover every HubSpot Deal and assume every future sales opportunity is a founder project. The selected design does the opposite: the ten audited Deal IDs are an explicit allowlist, and records outside that allowlist fail closed for this project-registry preflight.

A second false-green would accept an old cached snapshot after HubSpot changed. The preflight therefore requires a provider `observedAt` timestamp and rejects snapshots older than five minutes by default or suspiciously future-dated beyond bounded clock skew.

## Lindy choice

Use a pure TypeScript registry and validator over an already-authenticated, sanitized provider snapshot.

Do not add:

- a HubSpot SDK;
- an HTTP mutation client;
- OAuth or token handling;
- a Supabase migration;
- a second plugin authority model;
- automatic CRM writes;
- automatic adoption of new Deals.

## L99 boundaries

- Expected HubSpot account is exactly `246754542`.
- The ten audited founder-project Deal IDs are exact authority inputs.
- Provider snapshots may be inspected; mutation remains unavailable in this adapter.
- Provider snapshot freshness is bounded and stale evidence fails closed.
- Malformed IDs, names, record arrays, or timestamps block rather than throwing or being normalized into success.
- Local CLI account evidence may be supplied and is rejected when it points at another account.
- HubSpot sales stages remain observed metadata only.
- Juss Beautiful Hair remains a portfolio-level record rather than pretending one repository contains all of its private and public operating truth.
- Se’kret Bip Demo / Redirect remains explicitly non-authoritative.
- StoryEngine uses the current repository identity `jussray/StoryEngine`.
- Existing Plugin Center rules remain authoritative for CRM mutation, confirmation, associations, secrets, export, messaging, payments, and quotes.

## Decision

Add `src/providers/HubSpotReadOnlyProvider.ts` with:

1. the expected HubSpot account ID;
2. the ten audited founder-project Deal registrations;
3. Deal-to-source authority metadata;
4. a read-only preflight validator;
5. bounded provider-snapshot freshness validation;
6. optional local CLI account-binding verification;
7. zero mutation methods.

Add behavior tests proving the adapter blocks wrong accounts, CLI mismatch, stale/future/malformed snapshots, missing records, unknown records, duplicate records, and renamed records while refusing to convert sales-stage labels into project status.

## Bill Gates pass

Bottleneck: HubSpot contains useful project records, but FCR previously had no typed way to distinguish those ten records from ordinary future sales Deals.

Highest leverage: standardize one explicit project registry and one read-only preflight.

Reusable standard: every external system that doubles as both operating data and business data needs an explicit scope registry and freshness contract before automation.

Do not scale yet: no project-status schema, automated task reconciliation, contact/company ingestion, CRM mutation executor, or writeback loop until the read path is proven and a separate founder-approved mutation contract exists.

## Elon Musk pass

- Reuse the existing Plugin Center HubSpot authority contract instead of creating another policy layer.
- Do not add a network client when a sanitized authenticated snapshot is enough for the first proof slice.
- Do not add a custom HubSpot project object or migrate existing records merely to make the model look cleaner.
- Keep the feedback loop short: exact registry -> focused tests -> exact-head CI -> only then consider a read transport.
- Automate writes last.

## Proof required

- focused Vitest behavior tests for the read-only provider;
- TypeScript typecheck;
- lint;
- full test suite or repository-required exact-head CI;
- static diff review proving no credential, schema, runtime mutation, provider write, UI, or deployment path was introduced;
- Playwright is inapplicable unless a user-facing surface is changed later.

Local test execution from the current assistant runtime is unavailable because that runtime cannot resolve `github.com`; hosted exact-head GitHub Actions is therefore the executable repository proof lane for this change.

## Rollback

Revert the focused provider/test/artifact changes. No HubSpot record, association, credential, connection, pipeline, schema, task, contact, company, provider setting, or production deployment is changed by this slice.

## Next gate

After exact-head repository proof passes, confirm local `hs account current` resolves to `246754542` when workstation CLI binding is used. Then design a separately reviewed read transport that feeds sanitized project snapshots into this preflight. CRM mutation remains a separate L6 founder gate.
