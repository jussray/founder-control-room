# Authority Receipt Consumption Store

## Current source state

Founder Control Room defines an `AuthorityReceiptV2` domain contract and a Postgres-backed one-winner consumption primitive for future privileged execution adapters.

The source migration creates `public.authority_receipt_consumptions` with `receipt_id` as the primary key and exposes `public.claim_authority_receipt_consumption(...)` to `service_role` only. The function uses `INSERT ... ON CONFLICT (receipt_id) DO NOTHING`, so concurrent claims for the same receipt have one database-owned winner. Valid hexadecimal head SHAs are accepted case-insensitively and persisted in canonical lowercase form.

Browser roles do not receive table or function authority. Row-level security remains enabled on the table.

## Capability boundary

This document describes source capability only. It does not claim that the migration has been applied to production, that the function is currently callable in the production project, or that any deployment path consumes AuthorityReceipt v2 yet.

Gate A installs the storage primitive without changing `.github/workflows/deploy.yml`. That bootstrap separation is intentional: production deploy must not depend on a database primitive before the primitive itself has been deployed and read back.

Gate B may wire the canonical production deploy authority membrane to this store only after production evidence confirms the table/function and service-role access exist and duplicate claims lose atomically.

## Required production proof before Gate B

Before any deploy workflow begins relying on this store, reacquire live Supabase evidence that:

- `public.authority_receipt_consumptions` exists;
- `public.claim_authority_receipt_consumption(...)` exists;
- browser roles remain unable to use the table/function;
- the trusted service role can claim a valid receipt;
- a duplicate claim for the same `receipt_id` returns false without mutation; and
- the observed production migration ledger includes the canonical Git-owned migration identity.

Until that proof exists, treat production availability as UNKNOWN and keep the current deploy authority membrane unchanged.
