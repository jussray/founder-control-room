# Founder Control Room Guardrails

These guardrails are implemented in `src/guardrails.ts`, exposed through the public-safe `/guardrails` and `/guardrails.json` surfaces, and verified with the repository's existing Vitest and Supertest stack.

A status of `active` means the stated control is enforced on the relevant path. A status of `partial` means the policy or some enforcement exists, but a named runtime gap remains.

| ID | Status | Requirement | Current enforcement and gap |
|---|---|---|---|
| `FCR-AUTH-001` | `active` | Founder-only project reads require a valid session and founder allowlist authorization. | Existing `requireFounder` middleware; integration tests verify unauthenticated project access is denied. |
| `FCR-BOUNDARY-001` | `active` | Control Room must use its own Supabase project and never borrow Bip service-role credentials. | `makeSupabaseClient` validates the code-owned Control Room project ref before creating a privileged client. Unexpected cloud projects, insecure cloud URLs, malformed origins, and production-local URLs fail closed. Local Supabase requires an explicit non-production opt-in. |
| `FCR-DATA-001` | `active` | Raw teen journals, voice, media, companion memory, and private parent content must not enter Control Room operational storage. | GitHub webhook ingestion verifies the signature, resolves a registered project, then reduces the payload to typed, bounded, controller-required operational metadata before persistence. Route and sanitizer tests prove private and malformed fields are excluded. |
| `FCR-APPROVAL-001` | `active` | Evidence-backed merges may use standing founder authority while deployment, migration, rollback, auth, secrets, billing, deletion, and publication remain separate gates. | `docs/FOUNDER_MERGE_AUTHORITY.md`, active AI instruction files, and explicit public contract fields. |
| `FCR-PROVIDER-001` | `active` | Repository and AI providers remain replaceable adapters. | `RepositoryProvider` boundary and provider-neutral guardrail snapshot. |
| `FCR-SECRET-001` | `active` | Provider tokens, service-role keys, founder sessions, and private project data never appear in public responses. | Public status exposes IDs, states, and summaries only; tests scan responses for secret markers. |
| `FCR-RLS-001` | `partial` | Every final public migration table must have reviewed row-level-security state. | CI inventories create/drop/enable/disable operations across every authoritative migration and blocks new or stale gaps. Five legacy prototype tables remain without final RLS enablement pending an approved corrective migration. |
| `FCR-AUDIT-001` | `partial` | Material provider actions and project reads must be auditable. | Founder project reads fail closed on missing audit evidence. Provider-event persistence, duplicate resolution, and processed/failed transitions now reject database errors and missing-row success. Mutation audit atomicity, the two-write failed-status transition, and full provider-action coverage remain incomplete. |

## Supabase identity contract

The privileged backend accepts the production project origin only when it matches:

```text
https://oojzfmmywbvficgybaxd.supabase.co
```

The expected project ref is code-owned. It is deliberately not configurable through a second environment variable because changing the URL and expected value together would defeat accidental cross-project protection.

Local Supabase may be used only when all of the following are true:

- `SUPABASE_ALLOW_LOCAL=true` is explicitly set;
- `NODE_ENV` is `development` or `test`;
- the hostname is `localhost`, `127.0.0.1`, or `::1`.

Unknown runtime environments are treated as production. Embedded credentials, query parameters, fragments, nested paths, insecure cloud URLs, and custom cloud ports are rejected before the service-role client is created.

## Migration-wide RLS contract

`scripts/verify-rls-contract.mjs` reads every SQL file in `supabase/migrations` in filename order and models public-table lifecycle operations:

- `CREATE TABLE` and `CREATE TABLE IF NOT EXISTS`;
- `DROP TABLE`;
- `ENABLE ROW LEVEL SECURITY`;
- `DISABLE ROW LEVEL SECURITY`.

`CREATE TABLE IF NOT EXISTS` is treated as a no-op when the table already exists, so a later compatibility migration cannot falsely erase an earlier RLS state in the inventory.

The contract fails when:

1. a final public table lacks RLS and is absent from the reviewed baseline;
2. a baseline entry remains after the table becomes protected or disappears;
3. a gap's source migration changes;
4. a baseline entry lacks a precise reason or source migration;
5. duplicate gap entries exist.

The retained CI artifact `rls-contract-report` records the result for review. The current reviewed gaps are:

- `lanes`: legacy prototype lane metadata;
- `events`: legacy prototype payload inbox, distinct from hardened `provider_events`;
- `ooda_steps`: legacy prototype mission-step content;
- `prototype_evidence`: legacy prototype artifact references;
- `escalations`: legacy prototype blocker and escalation text.

All five originate in `002_lanes_missions_events.sql`. They must be treated as backend/service-role-only, with direct authenticated client access prohibited, until a separately approved corrective migration enables RLS and defines the intended policy. The inventory gate prevents the gap set from growing silently, but it does not repair these tables, so `FCR-RLS-001` remains `partial`.

## Provider-event minimization contract

GitHub webhook data crosses into Control Room storage only through the signed ingestion path:

1. HMAC verification is performed against the raw request bytes before JSON parsing.
2. Unsupported events and unregistered repositories are accepted without persistence to prevent retries from becoming a data-ingestion side door.
3. Supported events are reduced to the metadata currently required by the relevant controllers.
4. Allowed scalar fields are type-checked and length-bounded. Objects and arrays cannot pass through a scalar allowlist key.
5. Allowed URLs are restricted to HTTP or HTTPS and stripped of embedded credentials, query parameters, and fragments.
6. PR bodies, sender and organization records, installation data, reviewer lists, avatars, nested repository objects, deployment payloads, and unknown fields are dropped before `persistProviderEvent` is called.

A controller that needs a new provider field must extend the typed allowlist and its tests first. Until then, the field resolves as absent, which is the intended fail-closed behavior.

## Founder project-read audit contract

The Project Registry access gate wraps `projectsRouter` after unrelated repository-verification routes. For successful founder GET responses it:

1. identifies the read surface and registered project or projects represented by the response;
2. creates a sanitized event for registry, project, release, connection, directory, or file access;
3. stores the founder user UUID rather than the founder email;
4. releases the original response only after the audit insert succeeds;
5. replaces the response with `AUDIT_PERSISTENCE_FAILED` when project resolution or event persistence fails.

Existing 4xx and 5xx responses are not rewritten, and non-GET methods are outside this response gate. An empty registry has no project row to use as the required `project_events.project_id`; because it discloses no project records, it is the documented zero-row exception.

This closes false-success behavior for founder project reads. The guardrail remains `partial` because mutations are not yet transactionally coupled to their audit events and other material provider-action surfaces still require a complete coverage review.

## Provider-event status integrity contract

The durable provider inbox rejects silent or phantom success at every currently available application-level transition:

1. a fresh provider-event insert must return a concrete row ID;
2. a duplicate receipt is accepted only after a separate lookup confirms the existing row ID;
3. duplicate lookup errors and zero-row lookups fail closed;
4. processed and failed status updates must return the updated event row ID;
5. zero-row updates are treated as failures rather than successful no-ops;
6. stored provider error text has control characters removed and is capped at 1,000 characters;
7. attempt-counter RPC failures are surfaced to the caller.

The failed transition still performs the status update and attempt increment as two database operations. A failure between those operations can leave `processing_status = failed` without the incremented attempt count. Closing that gap requires an approved transactional database RPC or equivalent migration, so `FCR-AUDIT-001` remains `partial`.

## Public status surfaces

`GET /guardrails` is intentionally public and contains only non-sensitive vision and enforcement metadata.

`GET /guardrails.json` provides the same contract in machine-readable form, including:

- `sensitiveFieldsIncluded: false`
- `standingMergeAuthority: true`
- `approvalCarryForward: false`

Standing merge authority means an appropriate repository integration can proceed without another merge-only prompt. It does not carry into deploy, migration, auth, secrets, billing, deletion, publication, distribution, or external action.

Neither surface may include environment values, founder identity, tokens, project secrets, private event payloads, or repository credentials.

## Verification

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run verify:rls-contract
```

The integration tests and repository contracts verify the HTML and JSON status surfaces, secret minimization, public health, unauthenticated denial of project access, Supabase project-identity enforcement, migration-wide RLS inventory, typed bounded provider-event minimization, fail-closed founder project-read auditing, and provider-event persistence/status failure behavior. They do not substitute for a corrective RLS policy migration, transactional mutation auditing, deployment evidence, or authenticated production end-to-end evidence.
