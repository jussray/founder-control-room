# Account Deletion & Data Erasure

> **Founder Control Room** — Account Deletion Proof Document  
> Source review: 2026-11-24. **NOT a production compliance certificate.**  
> Live readback: no deployed `founder-control-room-deletion-queue` Worker was found; the connected FCR Supabase `deletion_queue` had zero rows at inspection. This observation can change.

## 1. User-Initiated Deletion
Users can delete their account at any time:
1. Navigate to **Settings → Account → Delete Account**.
2. Confirm with email OTP challenge.
3. A deletion request uses the **Supabase** `public.deletion_queue` table; this is **not** a Cloudflare Queue. Source code attempts global sign-out and deletion, but the end-to-end 30-second session and 72-hour residual-erasure targets are **not production-verified**. Do not advertise them as guarantees until the scheduled Worker is deployed through the authorized release gate and observed working.

## 2. What Gets Deleted
| Data Store | Deletion Method | Timeline |
|---|---|---|
| Supabase Auth user record | `supabase.auth.admin.deleteUser(userId)` | Immediate |
| User profile row | CASCADE DELETE via FK constraint | Immediate |
| Audit logs | Service-role-only `anonymize_user_audit_logs` RPC; failures must block success | **Not production-verified** |
| Cloudflare KV cache | Scheduled deletion Worker invokes Cloudflare KV REST deletes for configured namespaces | 72-hour **target, unverified** |
| Cloudflare Analytics | Aggregated; no PII stored | N/A |
| Backups | Overwritten within 30-day backup rotation | 30 days |

## 3. Implementation Reference
```typescript
// src/api/account/delete.ts
export async function deleteAccount(userId: string) {
  await supabase.from('profiles').update({ deleted_at: new Date() }).eq('id', userId);
  await supabase.auth.admin.signOut(userId, 'global');
  // A service-role RPC anonymization failure must be checked before enqueuing.
  const { error } = await supabase.rpc('anonymize_user_audit_logs', { p_user_id: userId });
  if (error) throw error;
  await supabase.from('deletion_queue').insert({ user_id: userId, status: 'pending' });
  await supabase.auth.admin.deleteUser(userId);
}
```

## Recovery and retry policy (current source behavior)

- Status transitions are `pending → processing → done` or `pending → processing → failed`.
- **No automatic retry is configured.** A failed row stays `failed`; a crashed job may stay `processing`. Neither state is automatically selected by the current scheduled Worker. Never call that a successful erasure.
- An authorized operator must inspect failed and stale-processing counts and error classes, check downstream idempotency and previous erasure evidence, then obtain founder-governed approval for a *specific* job before manually returning it to `pending`. Do not bulk requeue or re-delete.
- Where a job is `processing` beyond one six-hour cron interval, treat it as **stale/unknown**, not `done`. Confirm the prior invocation is no longer running before a scoped retry. Treat a `failed` row as **unresolved** until an independently verified `done` receipt is observed.
- Measure and alert on counts/ages of `pending`, `processing`, and `failed` jobs without exporting private user IDs into public logs. Escalate before the 72-hour target; do not infer operation from a passing configuration check.
- Before *unattended* retries can be enabled, add and verify an atomic claim/lease, bounded attempts/backoff, idempotent downstream operations, exhaustion handling, and tests for crashes/races. Those mechanisms **do not exist in the inspected source** and must not be silently assumed.
- Production deployment requires the independent exact-head verification, secrets readback (names/types only), founder production authority, and observed execution receipt documented in `docs/deployment/CLOUDFLARE_WORKER_TARGETS.md`. No scheduled account erasure should be triggered merely by merging documentation.

## 4. App Store Compliance
- **Apple App Store**: Requirement must be evaluated against observed in-app behavior; source alone does not prove compliance.
- **Google Play**: Requirement must be evaluated against observed app and web deletion flows; source alone does not prove compliance.

## 5. Operator-Initiated Deletion
The founder may hard-delete any user record from the Supabase dashboard or via `scripts/admin/delete-user.ts`.
