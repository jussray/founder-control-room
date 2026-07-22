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
| `FCR-AUDIT-001` | `partial` | Material provider actions and project reads must be auditable. | Every successful founder read served by `projectsRouter` now waits for a sanitized access event and fails closed if persistence or project resolution fails. Mutation audit atomicity and broader provider-action coverage remain incomplete. |

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
```

The integration tests verify the HTML and JSON status surfaces, secret minimization, public health, unauthenticated denial of project access, Supabase project-identity enforcement, typed bounded provider-event minimization, and fail-closed founder project-read auditing. They do not substitute for mutation-audit atomicity, full RLS verification, deployment evidence, or authenticated production end-to-end evidence.
