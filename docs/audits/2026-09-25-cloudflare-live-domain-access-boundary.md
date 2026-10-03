# Cloudflare live-domain Access boundary — 2026-09-25

Status: `SOURCE POLICY / PROVIDER STATE REQUIRES FRESH READBACK / RUNTIME PROOF REQUIRED`

## Founder decision

Cloudflare Access belongs on live product execution surfaces, not the public discovery doorway.

For a project with a verified live custom domain:

- apex and `www` remain public-facing unless a separately approved product contract says otherwise;
- a verified live `app.<domain>` surface is Access-protected;
- a verified live `api.<domain>` surface is Access-protected;
- preview, development, temporary, guessed, or not-yet-live hosts do not receive production Access policy merely because the naming convention exists.

A hostname is not promoted to `live` from repository naming, DNS intent, memory, or planned architecture. Provider/runtime evidence must establish it first.

## Founder Control Room application

Current FCR source authority is:

- public browser doorway: `foundercontrolroom.org` and `www.foundercontrolroom.org`;
- protected direct API surface: `api.foundercontrolroom.org`;
- `app.foundercontrolroom.org`: no production Access mutation until that exact hostname is separately proven live;
- public Pages-to-Worker execution: dynamic same-origin requests use the `FCR_API` Service Binding, so exact Worker identity can be proven without making the direct API publicly readable.

The existing `FCR Access Front Door Recovery` provider operation already has the correct mutation shape: detach only browser-facing public destinations from one uniquely identified mixed Access application while preserving non-browser Worker destinations and policies.

## Supersession

This receipt supersedes any older FCR proof language that required an anonymous stranger to receive the Worker payload directly from `https://api.foundercontrolroom.org/version`.

The corrected proof contract is:

1. anonymous apex / `www` browser path reaches FCR without a Cloudflare Access product-login screen;
2. a random stranger remains outside the authenticated founder shell;
3. anonymous direct `api.foundercontrolroom.org/version` presents a Cloudflare Access boundary;
4. same-origin `https://foundercontrolroom.org/version` reaches the canonical `founder-control-room` Worker through `FCR_API` and proves the exact expected SHA.

A successful source check does not prove current Cloudflare provider state. A provider mutation does not prove runtime outcome. Runtime completion requires fresh provider readback and Playwright on the exact production subject.

## Se’kret Bip reference pattern

Se’kret Bip already carries the intended target pattern in its Access audit source: `app.sekretbip.net` and `api.sekretbip.net` are the protected live-domain targets while the public brand doorway remains separate.

That repository remains authoritative for its own live/provider state. This FCR receipt does not mutate or certify Se’kret Bip production state.

## Rollback

This source correction is reversible by restoring the predecessor browser-proof script and contract test. No Cloudflare provider, DNS, Worker route, database, secret, billing, deployment, or publication state is mutated by this source change.
