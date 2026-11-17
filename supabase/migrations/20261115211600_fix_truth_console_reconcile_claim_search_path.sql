-- Let truth_console_reconcile_claim resolve pgcrypto's digest().
--
-- 20260917183000_truth_console_claims.sql pins the function to
-- `search_path = public, pg_temp`, but on Supabase pgcrypto is installed in
-- the `extensions` schema. `digest(bytea, unknown)` is therefore unresolvable:
-- `supabase db lint` reports SQLSTATE 42883 (function digest(bytea, unknown)
-- does not exist) and the function would raise the same error at runtime.
--
-- Only the function's search_path changes; its body, security invoker mode,
-- grants and behaviour are unchanged. `extensions` is placed after `public`
-- so no public object is shadowed; where no `extensions` schema exists
-- PostgreSQL skips the entry.
--
-- Source-only until an explicitly authorized apply.

alter function public.truth_console_reconcile_claim(uuid, bigint)
  set search_path = public, extensions, pg_temp;
