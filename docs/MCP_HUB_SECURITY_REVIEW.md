# MCP Hub Phase 1 — Red-Team Checklist

## Fail-closed boundaries

- [x] Unconfigured servers are disabled.
- [x] Unknown projects are denied.
- [x] Quarantined repositories are absent from allowlists.
- [x] Unknown tools are denied.
- [x] Write and destructive tool names are denied or require separate approval.
- [x] Paid capability declarations require explicit approval.
- [x] Supabase Development MCP is disabled in production.
- [x] Production MCP endpoints require HTTPS.
- [x] Tool responses have a hard size cap.
- [x] Tool requests have a bounded timeout.

## Credential and privacy boundaries

- [x] Registry stores environment variable names, not credential values.
- [x] Public server listing omits token and endpoint values.
- [x] Secret-shaped argument keys are rejected.
- [x] Evidence stores hashes and structural summaries, not raw payloads.
- [x] Control Room remains separate from Bip consumer data.
- [x] Teen journals, messages, transcripts and parent summaries are excluded.
- [x] Customer, order, vendor and private story content are excluded from evidence.

## Authority boundaries

- [x] MCP Phase 1 is read-only.
- [x] RepositoryProvider remains the deterministic repository write layer.
- [x] Branch creation requires separate founder approval.
- [x] Integration requires separate founder approval.
- [x] Deployment requires separate founder approval.
- [x] Rollback requires separate founder approval.
- [x] No approval carries forward.

## Evidence still required before merge

- [ ] TypeScript build passes in CI.
- [ ] Unit tests pass in CI.
- [ ] ESLint passes in CI.
- [ ] Migration is reviewed against the current Control Room schema.
- [ ] One local read-only MCP server completes initialize → tools/list.
- [ ] One allowed read tool call writes a redacted evidence row.
- [ ] One denied write tool call writes a blocked evidence row and performs no mutation.

The unchecked items are release gates, not decorative tasks. The PR must remain
unmerged until evidence exists or the founder explicitly narrows the scope.
