# Lovable surface binding rollback

The change is additive and does not migrate provider, database, repository, or customer state.

To reverse it safely, revert only the commits on `fix/lovable-surface-repository-bindings` that add the Lovable binding manifest/schema/tests/docs and the dedicated `_headers` stanza. Do not revert unrelated Founder Control Room work.

Rollback removes only repository-side discovery metadata. It does not delete or mutate any Lovable project, Supabase database, GitHub project repository, Chief state, FCR evidence, credential, deployment, or external provider state.
