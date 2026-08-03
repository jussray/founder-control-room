-- Forward-only hardening for intake-only Founder Signal review email receipts.
--
-- The legacy sender_verified column remains temporarily for deployment
-- compatibility. It means only that the envelope sender address matched the
-- configured founder mailbox. It is not authentication or execution authority.

ALTER TABLE public.founder_signal_review_email_receipts
  ADD COLUMN IF NOT EXISTS sender_address_matched BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS authorization_state TEXT NOT NULL DEFAULT 'intake_only_unresolved',
  ADD COLUMN IF NOT EXISTS execution_allowed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.founder_signal_review_email_receipts.sender_verified IS
  'Legacy compatibility alias. TRUE means only that the envelope sender address matched; it is not authentication.';

COMMENT ON COLUMN public.founder_signal_review_email_receipts.sender_address_matched IS
  'TRUE only when the envelope sender address matched the configured founder mailbox.';

COMMENT ON COLUMN public.founder_signal_review_email_receipts.authorization_state IS
  'Intake remains unresolved until a separately approved trusted processor verifies context, deadline, and authority.';

ALTER TABLE public.founder_signal_review_email_receipts
  ADD CONSTRAINT founder_signal_review_email_sender_address_matched_check
    CHECK (sender_address_matched = TRUE),
  ADD CONSTRAINT founder_signal_review_email_authorization_state_check
    CHECK (authorization_state = 'intake_only_unresolved'),
  ADD CONSTRAINT founder_signal_review_email_execution_allowed_check
    CHECK (execution_allowed = FALSE),
  ADD CONSTRAINT founder_signal_review_email_command_no_newlines_check
    CHECK (command_text !~ E'[\r\n]'),
  ADD CONSTRAINT founder_signal_review_email_command_semantics_check
    CHECK (
      (
        command_type = 'cancel_all'
        AND target_channel IS NULL
        AND command_text = 'cancel all'
      )
      OR
      (
        command_type = 'cancel_one'
        AND target_channel IS NOT NULL
        AND command_text = target_channel || ': cancel'
      )
      OR
      (
        command_type = 'edit_one'
        AND target_channel IS NOT NULL
        AND left(command_text, length(target_channel) + 2) = target_channel || ': '
        AND length(command_text) > length(target_channel) + 2
        AND lower(substr(command_text, length(target_channel) + 3)) <> 'cancel'
      )
    );

ALTER TABLE public.founder_signal_review_email_receipts
  ALTER COLUMN sender_address_matched DROP DEFAULT,
  ALTER COLUMN authorization_state DROP DEFAULT,
  ALTER COLUMN execution_allowed DROP DEFAULT;

-- Existing provider_actions_requested = 0 and RLS constraints remain in force.
-- This migration performs no provider action, no email send, and no publication.
