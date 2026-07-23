# Live Supabase security truth

Date: 2026-07-23
Project ref: `oojzfmmywbvficgybaxd`
Scope: read-only Supabase migration-history and Security Advisor inspection

## Executive truth

Repository policy intent and the live database are not currently identical.

The repository contains `supabase/migrations/20260723000000_lockdown_legacy_prototype_tables.sql`, which defines service-role-only policies and revokes direct `anon` and `authenticated` access for the five legacy prototype tables. The repository RLS contract has an empty `config/rls-known-gaps.json` baseline.

The live project migration history does **not** include that corrective migration. Its latest related migration is `20260719185720_enable_rls_on_prototype_only_tables`, which enabled RLS but did not create the policies now defined in the repository.

## Live Security Advisor findings

The live advisor reports `rls_enabled_no_policy` for:

- `public.escalations`
- `public.events`
- `public.founder_users`
- `public.lanes`
- `public.ooda_steps`
- `public.repository_capability_evidence`
- `public.repository_findings`
- `public.repository_verification_runs`

It also reports `function_search_path_mutable` for:

- `public.update_onboarding_updated_at`

Stripe-managed schema warnings were observed separately and are not claimed as Founder Control Room-owned remediation in this record.

## Interpretation

- RLS is enabled on the listed public tables.
- Policy coverage is incomplete in the live environment.
- `founder_users` may intentionally remain inaccessible to ordinary database roles, but the intended database-enforced policy/grant model still needs to be documented and verified explicitly.
- Repository CI proves migration intent and static contracts, not that production applied the migration.
- The public guardrail must remain `partial` for live RLS until an approved migration is applied and runtime behavior plus a post-change advisor scan are retained.

## Separate approval gate

This evidence record does not authorize:

- applying or merging a Supabase migration;
- changing RLS policies, grants, auth, RPCs, functions, or identities;
- changing credentials or secrets;
- deleting data;
- deploying the application.

## Required completion evidence

1. Founder approval for the exact migration and rollback plan.
2. Local or development-database migration lint and runtime role tests.
3. Application of the approved migration to the intended Supabase project.
4. Post-change Security Advisor evidence.
5. Runtime proof for service-role, founder, authenticated nonfounder, and anonymous access as applicable.
6. Updated repository and public guardrail status that matches the resulting live state.
