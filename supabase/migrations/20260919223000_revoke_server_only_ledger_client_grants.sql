-- Close latent client-role privilege on server/service-role-only ledgers.
--
-- These tables already have RLS enabled and intentionally define no anon/authenticated
-- policies. The application writes them only through trusted server-side service-role
-- paths. Revoking table privileges makes that authority boundary explicit instead of
-- relying on RLS alone to deny client access.

REVOKE ALL ON TABLE public.founder_signal_review_email_receipts FROM PUBLIC;
REVOKE ALL ON TABLE public.founder_signal_review_email_receipts FROM anon;
REVOKE ALL ON TABLE public.founder_signal_review_email_receipts FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.founder_signal_review_email_receipts TO service_role;

REVOKE ALL ON TABLE public.founder_signal_review_contexts FROM PUBLIC;
REVOKE ALL ON TABLE public.founder_signal_review_contexts FROM anon;
REVOKE ALL ON TABLE public.founder_signal_review_contexts FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.founder_signal_review_contexts TO service_role;

REVOKE ALL ON TABLE public.founder_signal_review_command_dispatches FROM PUBLIC;
REVOKE ALL ON TABLE public.founder_signal_review_command_dispatches FROM anon;
REVOKE ALL ON TABLE public.founder_signal_review_command_dispatches FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.founder_signal_review_command_dispatches TO service_role;

REVOKE ALL ON TABLE public.hair_commerce_receipts FROM PUBLIC;
REVOKE ALL ON TABLE public.hair_commerce_receipts FROM anon;
REVOKE ALL ON TABLE public.hair_commerce_receipts FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hair_commerce_receipts TO service_role;

COMMENT ON TABLE public.founder_signal_review_email_receipts IS
  'Server/service-role-only sanitized review-email receipts. Client table privileges are revoked; no anon/authenticated RLS policy is permitted.';

COMMENT ON TABLE public.founder_signal_review_contexts IS
  'Private review-window correlation state. Server/service-role only; client table privileges are revoked and no anon/authenticated policy is permitted.';

COMMENT ON TABLE public.founder_signal_review_command_dispatches IS
  'Sanitized provider-dispatch evidence. Server/service-role only; client table privileges are revoked. Provider 2xx proves hook acceptance, never downstream execution.';

COMMENT ON TABLE public.hair_commerce_receipts IS
  'Sanitized JBH commerce receipts ingested by the server-side service-role path. Client table privileges are revoked; no anon/authenticated policy is permitted.';
