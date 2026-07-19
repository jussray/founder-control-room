# Founder Control Room Guardrails

These guardrails are implemented in `src/guardrails.ts`, exposed through the public-safe `/guardrails` and `/guardrails.json` surfaces, and verified with the repository's existing Vitest and Supertest stack.

| ID | Requirement | Enforcement |
|---|---|---|
| `FCR-AUTH-001` | Founder-only project reads require a valid session and founder allowlist authorization. | Existing `requireFounder` middleware; integration tests verify unauthenticated project access is denied. |
| `FCR-BOUNDARY-001` | Control Room must use its own Supabase project and never borrow Bip service-role credentials. | Configuration and architecture boundary; the public status declares separate ownership without exposing values. |
| `FCR-DATA-001` | Raw teen journals, voice, media, companion memory, and private parent content must not enter Control Room operational storage. | The public snapshot exposes minimized metadata only; tests scan the status surfaces for forbidden private payload markers. |
| `FCR-APPROVAL-001` | Evidence-backed merges may use standing founder authority while deployment, migration, rollback, auth, secrets, billing, deletion, and publication remain separate gates. | `docs/FOUNDER_MERGE_AUTHORITY.md`, active AI instruction files, and explicit public contract fields. |
| `FCR-PROVIDER-001` | Repository and AI providers remain replaceable adapters. | `RepositoryProvider` boundary and provider-neutral guardrail snapshot. |
| `FCR-SECRET-001` | Provider tokens, service-role keys, founder sessions, and private project data never appear in public responses. | Public status exposes IDs, states, and summaries only; tests scan responses for secret markers. |
| `FCR-AUDIT-001` | Material provider actions and project reads must be auditable. | Existing project event logging; the registry marks audit evidence as required. |

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

The integration tests verify the HTML and JSON status surfaces, secret minimization, public health, and unauthenticated denial of project access. They do not substitute for Supabase RLS, provider-contract, deployment, or authenticated end-to-end evidence.
