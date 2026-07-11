-- Fix RLS policy: use is_founder() instead of auth.role() = 'authenticated'.
-- Authentication and founder authorization are not interchangeable.
--
-- Drops the overly-broad "founders_can_read" policy added in
-- 20260711214937_proof_gate_results.sql and replaces it with one scoped to
-- verified founders only.

DROP POLICY IF EXISTS "founders_can_read" ON public.proof_gate_results;

CREATE POLICY "founders_can_read"
  ON public.proof_gate_results
  FOR SELECT
  USING (public.is_founder());
