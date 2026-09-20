-- Extend sanitized Juss Beautiful Hair commerce receipts with authoritative
-- collected-value evidence. No customer, address, vendor, cost, margin, or
-- payment-instrument data is introduced.

ALTER TABLE public.hair_commerce_receipts
  ADD COLUMN IF NOT EXISTS collected_value_cents INTEGER,
  ADD COLUMN IF NOT EXISTS currency TEXT,
  ADD COLUMN IF NOT EXISTS revenue_state TEXT;

ALTER TABLE public.hair_commerce_receipts
  DROP CONSTRAINT IF EXISTS hair_commerce_receipts_revenue_evidence_check;

ALTER TABLE public.hair_commerce_receipts
  ADD CONSTRAINT hair_commerce_receipts_revenue_evidence_check CHECK (
    (
      event_type = 'paid_order_recorded'
      AND collected_value_cents BETWEEN 1 AND 100000000
      AND currency = 'USD'
      AND revenue_state = 'payment_collected'
    )
    OR
    (
      event_type <> 'paid_order_recorded'
      AND collected_value_cents IS NULL
      AND currency IS NULL
      AND revenue_state IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS hair_commerce_receipts_revenue_time_idx
  ON public.hair_commerce_receipts (revenue_state, occurred_at DESC)
  WHERE revenue_state IS NOT NULL;
