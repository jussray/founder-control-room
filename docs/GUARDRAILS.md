# Founder Control Room Guardrails

These guardrails are implemented in `src/guardrails.ts`, exposed through the public-safe `/guardrails` and `/guardrails.json` surfaces, and verified with the repository's existing Vitest and Supertest stack.

A status of `active` means the stated control is enforced on the relevant path. A status of `partial` means the policy or some enforcement exists, but a named runtime gap remains.

| ID | Status | Requirement | Current enforcement and gap |
|---|---|---|---|
| `FCR-AUTH-001` | `active` | Founder-only project reads require a valid session and founder allowlist authorization. | Existing `requireFounder` middleware; integration tests verify unauthenticated project access is denied. |
| `FCR-BOUNDARY-001` | `partial` | Control Room must use its own Supabase project and never borrow Bip service-role credentials. | Separate configuration and architecture exist, but runtime validation does not yet reject an unexpected Supabase project identity. |
| `FCR-DATA-001` | `partial` | Raw teen journals, voice, media, companion memory, and private parent content must not enter Control Room operational storage. | The public snapshot is minimized, but supported provider-event ingress still needs explicit field allowlisting or redaction before persistence. |
| `FCR-APPROVAL-001` | `active` | Evidence-backed merges may use standing founder authority while deployment, migration, rollback, auth, secrets, billing, deletion, and publication remain separate gates. | `docs/FOUNDER_MERGE_AUTHORITY.md`, active AI instruction files, and explicit public contract fields. |
| `FCR-PROVIDER-001` | `active` | Repository and AI providers remain replaceable adapters. | `RepositoryProvider` boundary and provider-neutral guardrail snapshot. |
| `FCR-SECRET-001` | `active` | Provider tokens, service-role keys, founder sessions, and private project data never appear in public responses. | Public status exposes IDs, states, and summaries only; tests scan responses for secret markers. |
| `FCR-AUDIT-001` | `partial` | Material provider actions and project reads must be auditable. | Some paths persist audit evidence, but read coverage is incomplete and failed audit writes do not yet fail closed everywhere. |

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

The integration tests verify the HTML and JSON status surfaces, secret minimization, public health, and unauthenticated denial of project access. They do not substitute for Supabase project-identity validation, webhook payload minimization, complete fail-closed audit persistence, RLS, deployment, or authenticated end-to-end evidence.
