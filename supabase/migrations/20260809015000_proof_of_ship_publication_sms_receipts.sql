-- Extend proof-of-ship receipts from schedule proof to live-publication + founder SMS proof.
-- Intentionally stores no post body, phone number, credentials, or private repository content.

ALTER TABLE public.proof_of_ship_receipts
  ADD COLUMN IF NOT EXISTS buffer_publication_status text,
  ADD COLUMN IF NOT EXISTS buffer_post_id text,
  ADD COLUMN IF NOT EXISTS live_post_url text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS sms_notification_status text,
  ADD COLUMN IF NOT EXISTS sms_provider text,
  ADD COLUMN IF NOT EXISTS sms_message_id text,
  ADD COLUMN IF NOT EXISTS sms_delivered_at timestamptz;

ALTER TABLE public.proof_of_ship_receipts
  ADD CONSTRAINT proof_of_ship_buffer_publication_status_check
    CHECK (buffer_publication_status IS NULL OR buffer_publication_status = 'published'),
  ADD CONSTRAINT proof_of_ship_sms_notification_status_check
    CHECK (sms_notification_status IS NULL OR sms_notification_status = 'delivered'),
  ADD CONSTRAINT proof_of_ship_publication_timeline_check
    CHECK (published_at IS NULL OR scheduled_at IS NULL OR published_at >= scheduled_at),
  ADD CONSTRAINT proof_of_ship_sms_timeline_check
    CHECK (sms_delivered_at IS NULL OR published_at IS NULL OR sms_delivered_at >= published_at);

CREATE INDEX IF NOT EXISTS proof_of_ship_receipts_published_at_idx
  ON public.proof_of_ship_receipts (published_at DESC)
  WHERE published_at IS NOT NULL;
