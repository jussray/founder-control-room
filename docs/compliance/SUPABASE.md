# Supabase Configuration & Compliance

> **Founder Control Room** — Supabase Proof Document  
> Last updated: 2026-07-19

## 1. Project Setup
- Supabase project region: `us-east-1`.
- Connection pooling via Supabase Pooler (PgBouncer, transaction mode) — connection strings stored as Cloudflare Workers secrets.

## 2. Row-Level Security (RLS)
RLS is **enabled on all tables**. Key policies:

| Table | Policy | Effect |
|---|---|---|
| `profiles` | `auth.uid() = id` | Users read/write only their own row |
| `missions` | `founder_access = true` | Only founder-role users can read |
| `audit_logs` | `auth.role() = 'service_role'` | Only server-side service key reads |
| `deletion_queue` | `auth.role() = 'service_role'` | Deletion worker only |

All RLS migrations are version-controlled in `supabase/migrations/`.

## 3. Migrations
- Migration files follow the `YYYYMMDDHHMMSS_description.sql` naming convention.
- CI pipeline runs `supabase db diff` to catch schema drift on every PR.
- Production migrations require founder approval before merge.

## 4. Auth Configuration
- Email + password enabled; magic link enabled.
- OAuth providers: GitHub (scoped to `read:user`, `user:email`).
- `confirmEmail: true` — unconfirmed users cannot access protected routes.
- `refreshTokenRotation: true` — compromised refresh tokens are auto-invalidated.

## 5. Storage
- Supabase Storage buckets are **private by default** with signed URL access.
- Bucket policies enforce per-user path isolation: `public/{user_id}/...`.

## 6. Vault / Secrets
- Third-party API keys (Anthropic, GitHub PAT, etc.) are stored in **Supabase Vault**, not in the `config` table.
- Access to Vault entries is restricted to `service_role` key only.

## 7. Backup & Recovery
- Point-in-time recovery (PITR) enabled on the Supabase Pro plan.
- Daily logical backups exported to a private Cloudflare R2 bucket.
- RTO target: 4 hours. RPO target: 1 hour.
