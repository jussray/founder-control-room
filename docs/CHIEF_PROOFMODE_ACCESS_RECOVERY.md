# Chief ProofMode Access Recovery

Status: `SOURCE CONTRACT / PROVIDER REPAIR NOT YET EXECUTED`

This lane lets Founder Control Room act as the trusted control-plane authority for the narrow Cloudflare Access repair needed by Chief ProofMode CI. It does not grant Chief, a pull-request workflow, a continuity cookie, or a successful build permission to mutate Cloudflare Access.

## Authority boundary

The command and recovery workflows become executable provider authority only after this source is lawfully integrated into the exact current FCR `main`. A PR head may test these files but must never receive the production Access admin credential or use this source as proof that provider state was changed.

The trusted command is founder-only and issue-scoped:

```text
/cloudflare-chief-access check <exact-fcr-main-sha> <immutable-chief-preview-origin>
/cloudflare-chief-access repair <exact-fcr-main-sha> <immutable-chief-preview-origin> <approval-reference>
```

The target must be exactly one origin matching:

```text
https://<8-hex>-chief-ai.mcgill-raylene.workers.dev
```

Paths, queries, fragments, credentials in URLs, production aliases, wildcard domains, and unrelated Workers are rejected.

## Provider mutation contract

The recovery path may create only one Cloudflare Access application policy with this shape:

```json
{
  "name": "ProofMode CI service auth",
  "decision": "non_identity",
  "include": [
    { "service_token": { "token_id": "<resolved-specific-Chief-token-id>" } }
  ]
}
```

Automatic repair is allowed only when provider readback resolves one exact public Access application whose sole destination is the requested immutable Chief preview host. Repair fails closed for `worker`, `preview_worker`, wildcard public destinations, multi-destination applications, duplicate matching applications, conflicting named policies, disabled or expired service tokens, missing credential identity, or ambiguous provider precedence.

The lane must not mutate DNS, Worker routes, Worker deployments, application destinations, secrets, databases, GitHub configuration, or any Access application beyond the exact eligible policy creation described above. Existing conflicting policy content is never overwritten automatically.

## Credential separation

FCR uses its existing dedicated Access credentials:

- `CLOUDFLARE_ACCESS_API_TOKEN` for read-only `check` mode.
- `CLOUDFLARE_ACCESS_ADMIN_API_TOKEN` only for founder-approved `repair` mode.
- At least one protected, non-secret identity selector must identify the already-existing Chief CI service token: `CHIEF_CLOUDFLARE_ACCESS_CLIENT_ID` or `CHIEF_CLOUDFLARE_ACCESS_SERVICE_TOKEN_ID`. Source presence does not prove either value exists or matches the intended live token.
- If both identity selectors are configured, FCR requires them to resolve to the same live Cloudflare service token and fails closed on mismatch.

Neither identity selector is authentication authority. The Chief client secret is not copied into FCR for policy repair. Browser/runtime verification remains on Chief's own exact-head Playwright workflows, which already hold their protected service-auth pair after switching to trusted runtime-proof source.

## Receipt and proof semantics

Raw provider receipts are ephemeral and suppressed from workflow logs. Only allowlisted identifiers, scope, target origin, configured state, and mutation boolean may enter the public receipt returned to founder issue `#485` and the retained artifact. The founder approval reference is represented only by a SHA-256 receipt when mutation is requested.

A successful policy repair proves only that the bounded provider policy exists after provider reread. It does not prove Chief runtime equivalence, `/version` identity, MCP behavior, capability-plan behavior, or browser success.

The next proof gate after a successful repair is therefore:

```text
same exact Chief PR head
-> rerun failed Chief ProofMode MCP Playwright job
-> rerun failed Chief capability-plan Playwright job
-> immutable /version returns exact Chief head
-> both browser lanes execute and pass
```

If the Chief head moves, the old runtime proof is stale and must not be promoted to the successor.

## Rollback

This source change is reversible by reverting the focused FCR commits before merge. No provider rollback is currently required because adding this source contract does not itself execute Cloudflare mutation.

If a future trusted repair actually creates the exact Service Auth policy and rollback is required, delete only that exact policy after fresh provider readback and separate founder-approved mutation authority. Do not widen the rollback into application, token, DNS, Worker, route, or unrelated policy changes.
