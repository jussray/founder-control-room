# Account Deletion & Data Erasure

> **Founder Control Room** — Account Deletion Proof Document  
> Last updated: 2026-07-19

## 1. User-Initiated Deletion
Users can delete their account at any time:
1. Navigate to **Settings → Account → Delete Account**.
2. Confirm with email OTP challenge.
3. Deletion is queued and completed within **30 seconds** for active sessions, **72 hours** for all residual data.

## 2. What Gets Deleted
| Data Store | Deletion Method | Timeline |
|---|---|---|
| Supabase Auth user record | `supabase.auth.admin.deleteUser(userId)` | Immediate |
| User profile row | CASCADE DELETE via FK constraint | Immediate |
| Audit logs | Anonymized (actor_id → NULL) | 72 hours |
| Cloudflare KV cache | `CF_KV.delete(userId)` Worker job | 72 hours |
| Cloudflare Analytics | Aggregated; no PII stored | N/A |
| Backups | Overwritten within 30-day backup rotation | 30 days |

## 3. Implementation Reference
```typescript
// src/api/account/delete.ts
export async function deleteAccount(userId: string) {
  await supabase.from('profiles').update({ deleted_at: new Date() }).eq('id', userId);
  await supabase.auth.admin.signOut(userId, 'global');
  await supabase.from('deletion_queue').insert({ user_id: userId });
  await supabase.auth.admin.deleteUser(userId);
}
```

## 4. App Store Compliance
- **Apple App Store**: Satisfies Account Deletion Requirement (4.2) — in-app deletion available without contacting support.
- **Google Play**: Satisfies Data Deletion Policy — deletion available within the app and via web.

## 5. Operator-Initiated Deletion
The founder may hard-delete any user record from the Supabase dashboard or via `scripts/admin/delete-user.ts`.
