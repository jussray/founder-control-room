-- Provider-neutral external commerce witness ledger.
--
-- This is deliberately additive. Do not rewrite or relax the existing
-- fcr_commerce_receipts Shopify ledger: it is an already-executed, provider-
-- specific truth contract. New providers write here with opaque text
-- identities while the existing Shopify money path remains unchanged.
--
-- Privacy boundary: no customer name/email/phone/address, payment instrument,
-- shipping detail, or raw provider payload is stored here.

CREATE TABLE IF NOT EXISTS public.fcr_external_commerce_receipts (
  provider TEXT NOT NULL CHECK (provider ~ '^[a-z][a-z0-9_-]{1,31}$'),
  delivery_id TEXT NOT NULL CHECK (char_length(delivery_id) BETWEEN 1 AND 255),
  event_id TEXT NOT NULL CHECK (char_length(event_id) BETWEEN 1 AND 255),
  contract_id TEXT NOT NULL CHECK (char_length(contract_id) BETWEEN 1 AND 255),
  account_fingerprint TEXT NOT NULL CHECK (account_fingerprint ~ '^[0-9a-f]{64}$'),
  resource_ref_hash TEXT NOT NULL CHECK (resource_ref_hash ~ '^[0-9a-f]{64}$'),
  event_type TEXT NOT NULL CHECK (event_type = 'payment_collected'),
  revenue_state TEXT NOT NULL CHECK (revenue_state = 'payment_collected'),
  collected_value_cents INTEGER NOT NULL CHECK (
    collected_value_cents BETWEEN 1 AND 100000000
  ),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  occurred_at TIMESTAMPTZ NOT NULL,
  api_version TEXT,
  api_version_date DATE,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, delivery_id)
);

-- Provider-native semantic event identity. Multiple webhook deliveries for the
-- same provider event must classify as duplicate/conflict instead of creating
-- duplicate revenue.
CREATE UNIQUE INDEX IF NOT EXISTS fcr_external_commerce_provider_event_uidx
  ON public.fcr_external_commerce_receipts (
    provider,
    account_fingerprint,
    event_id
  );

-- A provider resource/event pair may contribute collected revenue only once.
-- This is intentionally independent of provider delivery identity.
CREATE UNIQUE INDEX IF NOT EXISTS fcr_external_commerce_resource_event_uidx
  ON public.fcr_external_commerce_receipts (
    provider,
    account_fingerprint,
    resource_ref_hash,
    event_type
  );

CREATE INDEX IF NOT EXISTS fcr_external_commerce_event_time_idx
  ON public.fcr_external_commerce_receipts (revenue_state, occurred_at DESC);

ALTER TABLE public.fcr_external_commerce_receipts ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies are created. Provider-specific webhook
-- boundaries authenticate first, then persist with FCR's server-side
-- service-role client.
