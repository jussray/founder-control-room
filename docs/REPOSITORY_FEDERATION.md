# Repository Federation

Founder Control Room is a portfolio control plane. It does not become the source repository, product database, deployment owner, or secret vault for the products it observes.

## Authority model

Each registered repository remains authoritative for:

- source code and history;
- its default branch and exact commit;
- tests and verification workflows;
- product-specific runtime configuration;
- migrations and rollback procedures;
- deployment evidence;
- product and customer data.

Founder Control Room may read approved repository metadata, compare declared capabilities with exact-commit evidence, retain sanitized operational observations, create findings, and prepare a proposed repair mission. It may not create a branch, integrate, deploy, roll back, reveal a secret, or perform a destructive action without a separate founder approval for that action.

## Repository-owned manifest

Every portfolio repository stores:

```text
.control-room/repository.manifest.json
```

The manifest must conform to `schemas/repository-manifest.schema.json` and identify:

1. the Control Room project slug;
2. the repository provider and provider identifier;
3. the default branch;
4. exact provider check names that prove the repository;
5. active, planned, and retired capabilities;
6. repository paths that prove each capability;
7. build-assist preference and risk;
8. operational packet fields allowed to leave the repository boundary;
9. data that must never enter Founder Control Room.

A capability declared `active` is not considered verified merely because its manifest says so. Founder Control Room resolves the exact default-branch commit, confirms every evidence path at that commit, and evaluates the required provider checks attached to that same commit.

## Verification states

Repository run:

- `passed`: manifest valid, every required check passed, and active capabilities are backed by code evidence;
- `warning`: proof is pending or a capability remains intentionally unverified;
- `failed`: manifest invalid, required proof missing/failed, or an active capability drifted.

Capability:

- `verified`: declared active evidence and checks exist;
- `drifted`: active claim disagrees with code or required checks;
- `unverified`: planned or pending proof;
- `retired`: intentionally no longer active.

## Provider authentication

Production GitHub reads use the GitHub App already owned by Founder Control Room:

```text
GITHUB_APP_ID
GITHUB_PRIVATE_KEY
```

For each repository read, the provider layer:

1. creates a short-lived RS256 App JWT;
2. resolves the GitHub App installation that owns the repository;
3. requests a token scoped to that repository installation;
4. caches the token only until five minutes before expiration.

`GITHUB_TOKEN` is a local/development fallback only. It is not the production authority and must not be placed in product manifests or operational packets.

## Observation paths

Founder Control Room learns about repositories through two paths.

### Active provider scan

`ManifestController` uses `RepositoryProvider` to resolve the exact commit, read the manifest and declared files, and obtain CI/check signals. The scheduled portfolio loop enqueues only repositories that are enabled, due, and not already waiting on a retry.

### Signed repository ping

A repository-local runner may POST a reduced verification packet to:

```text
POST /ingest/repository-verification
```

Required headers:

```text
x-control-room-project: <project slug>
x-control-room-delivery: <unique delivery id>
x-control-room-signature: sha256=<HMAC of exact request body>
```

The per-repository secret is preferred:

```text
REPOSITORY_INGEST_SECRET_<NORMALIZED_PROJECT_SLUG>
```

The backend discards unknown packet fields and verifies project/repository identity against its registry before accepting evidence.

## GitHub webhook privacy

GitHub webhooks are authenticated with the raw body, but the raw payload is never written to Founder Control Room. `githubEventSanitizer.ts` creates a strict operational allowlist before the provider inbox is called.

Excluded data includes:

- commit messages;
- pull request title/body/comments;
- sender, user, author, committer, reviewer, and assignee objects;
- email addresses;
- patches and source contents;
- unknown provider fields;
- secret-bearing URL query strings and fragments.

The sanitizer retains only repository identity, exact SHAs/refs, check/workflow/deployment states, counts, timestamps, and sanitized HTTPS evidence URLs.

## Findings and build assistance

Drift becomes a deduplicated `repository_findings` row. A founder can convert selected open findings into a `proposed` mission. The mission records the source commit and requested repair scope but grants no write authority.

Every later action remains separate:

1. create sandbox/workspace;
2. create branch;
3. commit proposed patch;
4. request review;
5. integrate;
6. deploy;
7. roll back.

Approval for one action never authorizes the next.

## Adding a repository

1. Register the project and provider identifier in Founder Control Room.
2. Install/authorize the Founder Control Room GitHub App for that repository.
3. Add `.control-room/repository.manifest.json` in the product repository.
4. Use exact visible provider check names.
5. Mark unfinished capability claims `planned`, not `active`.
6. List only stable repository paths as evidence.
7. Declare forbidden product/user data explicitly.
8. Open a draft PR and keep it draft until the declared checks execute at the exact commit.
9. Merge the manifest through that repository's normal approval process.
10. Enable scheduled verification only after the manifest reaches the default branch.
11. Configure repository webhook or signed runner pings for faster refresh, while retaining scheduled scans as reconciliation backup.

## Failure handling

- Missing App installation/credentials or a transient provider failure returns `retry` with backoff.
- Coalesced outbox rows are reactivated after completion.
- A delayed retry is not accidentally marked complete.
- Controller leases are acquired atomically and expired leases may be reclaimed.
- The demo project remains excluded from the founder's main portfolio.
- An unproven repository remains visible as unverified/failed; it is never silently promoted to healthy.
