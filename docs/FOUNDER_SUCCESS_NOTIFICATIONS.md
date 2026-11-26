# Founder Success Notifications — activation runbook

Status: candidate branch only. This document is not a production or phone delivery receipt.

## Scope and proof boundaries

- Signed registered GitHub workflow success, same-run exact-SHA recovery, actual PR merge, and provider-reported deployment success feed the existing project event ledger.
- The push worker claims one delivery per opted-in device and event; provider acceptance is distinct from a phone displaying a notification.
- Existing GitHub failure alerts, approval gates, and production deployment authority are unchanged.
- Independent live verification and all-project completion alerts remain held until a canonical proof-engine adapter is implemented. Never label ordinary green CI as either.
- The notification page is a standalone Home Screen app on iPhone. Browser permission must be granted through the owner's tap.

## Before enabling

1. Review the candidate branch and run the full repository test suite, TypeScript checks, Pages packaging and exact-head Worker dry run.
2. Generate a named migration with the repository-pinned Supabase CLI using `supabase migration new founder_notifications`; copy the reviewed SQL from `supabase/preview-contracts/founder_notifications.sql` into the generated file. Validate schema, RLS/grants, claim concurrency, retry limits and revocation on a disposable database. Apply only through the existing approved migration workflow.
3. Set the owner binding `FCR_WEB_PUSH_FOUNDER_USER_ID` to the verified allowlisted Supabase user UUID. Do not guess this ID, add a founder, or use a client-provided identity.
4. Generate an independent random P-256 VAPID scalar and 32-byte storage key in an authorized terminal. Install them only as server secrets `FCR_WEB_PUSH_VAPID_PRIVATE_KEY` and `FCR_WEB_PUSH_STORAGE_KEY` (unpadded base64url). Keep them stable across releases. Never commit them or paste them into chat. Set `FCR_WEB_PUSH_SUBJECT` to an authorized contact URI.
5. After successful schema verification and existing release authority, set `FCR_WEB_PUSH_ENABLED=true` on the canonical Worker. This feature defaults to disabled. Confirm the configured cron cadence, database claim RPC, and Pages route; no immediate delivery SLA is claimed.
6. On the canonical apex site, open /control-room/notifications, add to Home Screen, open it, sign in, select Enable notifications, then Send test. Confirm actual notification arrival on the phone. Next prove a genuine GitHub success event and its corresponding provider-accepted receipt.

## Verification criteria

- Unauthenticated or non-owner config/feed/enrollment calls are rejected. Mutations also require the current interactive founder session and existing same-origin protection.
- No anonymous or authenticated client database role can read subscription ciphertext or claim deliveries directly.
- Duplicate webhook delivery and competing claimers do not create a second delivery row. Transport retries may be at-least-once; a stable push topic and notification tag reduce duplicates.
- Expired endpoints are revoked; retry exhaustion remains unknown, not delivered.
- Lock-screen payload contains no private repository names or evidence links. Detailed event data is rendered after founder sign-in.
- Test acceptance from the provider and a witnessed phone alert are separate receipts.

## Rollback

Set FCR_WEB_PUSH_ENABLED=false. This stops new push delivery without changing GitHub alert settings or deleting event history. Revert candidate source through the normal review process if needed. Keep database rows and keys according to the approved retention/rotation policy.
