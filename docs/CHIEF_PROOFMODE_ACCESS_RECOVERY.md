# Chief ProofMode Access Recovery

Status: `SOURCE CONTRACT / PROVIDER REPAIR NOT YET EXECUTED / RUNTIME WITNESS NOT YET EXECUTED`

This lane lets Founder Control Room act as the trusted control-plane authority for the narrow Cloudflare Access recovery and exact-head runtime evidence needed by Chief ProofMode. It does not grant Chief, a pull-request workflow, a continuity cookie, a successful build, or this unmerged FCR branch permission to mutate Cloudflare Access or publish trusted Chief runtime evidence.

## Authority boundary

The command, recovery, and runtime-witness workflows become executable provider/evidence authority only after their source is lawfully integrated into the exact current FCR `main`. A PR head may test these files but must never receive the production Access admin credential, the protected runtime client secret, or the GitHub App private key merely because the source exists here.

The trusted Access command is founder-only and issue-scoped:

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

The Access recovery lane must not mutate DNS, Worker routes, Worker deployments, application destinations, secrets, databases, GitHub rulesets, or any Access application beyond the exact eligible policy creation described above. Existing conflicting policy content is never overwritten automatically.

## Credential separation

FCR uses distinct capabilities for distinct truth planes:

- `CLOUDFLARE_ACCESS_API_TOKEN` is read-only provider authority for `check` mode.
- `CLOUDFLARE_ACCESS_ADMIN_API_TOKEN` is available only to founder-approved `repair` mode.
- A read-only `check` may discover the Chief service-token identity only from exactly one existing `non_identity` service-token binding on the provider-resolved effective Chief Access application. It never selects a token merely because that token exists elsewhere in the account, and zero or multiple bound identities fail closed.
- `repair` still requires at least one protected, non-secret identity selector for the already-existing Chief CI service token: `CHIEF_CLOUDFLARE_ACCESS_CLIENT_ID` or `CHIEF_CLOUDFLARE_ACCESS_SERVICE_TOKEN_ID`.
- The separate trusted runtime-witness workflow requires the protected Access client credential pair in FCR's `production` environment. Source references do not prove those protected values exist, are current, or correspond to the provider-observed service token.
- GitHub evidence publication uses FCR's repository-scoped GitHub App identity (`APP_ID` + `APP_PRIVATE_KEY`) only after provider installation readback proves `checks: write` and `deployments: write` for `jussray/chief-ai-machine`.

In plain terms, repair still requires the explicit selector and its separate founder mutation authority; runtime-witness approval cannot substitute for repair approval.

No secret value is accepted as a workflow input, written to a PR, returned in a public receipt, or copied into candidate-authored Chief workflows.

## Trusted runtime witness

After this source is lawfully integrated into exact current FCR `main`, `.github/workflows/chief-proofmode-runtime-witness.yml` is the separate evidence path for Attack 3000. It is not a repair workflow.

The workflow is constrained to:

```text
founder-bound exact FCR current main
-> exact open Chief PR #143 head
-> one immutable Chief preview
-> Cloudflare Access check mode only
-> protected runtime client credential pair
-> exact /version proof
-> real ProofMode Playwright semantics
-> GitHub App installation permission readback
-> live Chief ruleset #20818149 readback, unchanged and zero-bypass
-> fixed App Check Run
-> fixed proofmode-access-admin evidence deployment/status
-> independent GitHub readback
-> re-read exact Chief PR head and exact FCR main
```

The Playwright witness verifies the same runtime semantics owned by Chief: exact `/version`, MCP initialization identity, the single read-only `audit_repository` tool surface, POST-only legacy transport, and exact-head repository audit behavior. A Cloudflare build or preview URL alone cannot satisfy this gate.

The evidence publisher is fixed to:

- repository: `jussray/chief-ai-machine`
- pull request: `#143`
- ruleset: `#20818149` (`Chief AI main exact-head gate`)
- check name: `Verify candidate ProofMode runtime with Playwright`
- deployment environment: `proofmode-access-admin`

The caller cannot choose a different repository, check name, environment, conclusion, ruleset, or bypass actor. The publisher fails before any GitHub mutation if the App lacks `checks: write` or `deployments: write`, if Chief #143 moved, if #208 changed materially, if bypass actors appear, if the reserved candidate check becomes prematurely ruleset-bound, or if the protected runtime receipt is incomplete.

The `proofmode-access-admin` GitHub Deployment object is an evidence object required by the existing #208 topology. It uses `auto_merge: false`, `transient_environment: true`, and `production_environment: false`. It does not deploy Chief software and does not grant deploy or merge authority. Chief currently has no deployment-event workflow that this evidence object is intended to trigger.

Repair and witness publication are deliberately separate operations. A repair dispatch may never publish runtime success. After any repair, a new read-only check/runtime-witness run must independently re-observe provider state and pass the real runtime proof before evidence is published.

Do not interpret this trusted path as permission to merely `rerun failed Chief ProofMode MCP Playwright job` or `rerun failed Chief capability-plan Playwright job`. Those historical candidate-source lanes remain authority-blocked for protected candidate proof and cannot substitute for the FCR-main witness.

## Receipt and proof semantics

Raw Cloudflare provider receipts are ephemeral and suppressed from workflow logs. Only allowlisted identifiers, scope, target origin, configured state, and mutation boolean may enter the public Access receipt returned to founder issue `#485` and the retained artifact. The founder approval reference is represented only by a SHA-256 receipt when mutation is requested.

A successful read-only Access discovery proves only that the observed effective application already has one unambiguous, live service-token binding. It grants no mutation authority and does not create or overwrite policy state.

A successful policy repair proves only that the bounded provider policy exists after provider reread. It does not prove Chief runtime equivalence, `/version` identity, MCP behavior, capability-plan behavior, or browser success.

A successful trusted runtime-witness run proves only its exact evidence subject: the founder-bound Chief candidate and immutable preview passed protected `/version` plus ProofMode runtime semantics under the trusted FCR-main source, and the resulting fixed GitHub App check/deployment evidence was read back. It still grants no merge authority, no production deployment authority, no ruleset mutation authority, and no bypass authority.

The proof chain is therefore:

```text
exact Chief PR head
-> trusted Access provider readback
-> protected FCR-main runtime witness
-> immutable /version exact SHA
-> ProofMode Playwright pass
-> App-identity check readback
-> proofmode-access-admin evidence readback
-> fresh founder final review
-> separate merge decision
```

If the Chief head moves, the old runtime proof is stale and must not be promoted to the successor. If FCR `main` moves, the trusted-source subject must likewise be reacquired.

## Rollback

This source change is reversible by reverting the focused FCR commits before merge. No provider rollback is currently required because adding this source contract does not itself execute Cloudflare mutation or GitHub runtime-evidence publication.

If a future trusted repair actually creates the exact Service Auth policy and rollback is required, delete only that exact policy after fresh provider readback and separate founder-approved mutation authority. Do not widen the rollback into application, token, DNS, Worker, route, or unrelated policy changes.

If a future trusted runtime witness publishes an evidence Check Run and `proofmode-access-admin` Deployment status, preserve those as historical receipts rather than deleting them to hide history. A moved or invalidated head makes them stale; it does not make the historical event false.
