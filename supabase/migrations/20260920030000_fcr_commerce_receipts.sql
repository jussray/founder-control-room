-- Founder Control Room's own Shopify commerce receipt ledger.
-- This is deliberately separate from Juss Beautiful Hair commerce truth.
-- It stores no customer name/email/phone/address, payment instrument, note,
-- shipping detail, or raw order payload.

CREATE TABLE IF NOT EXISTS public.fcr_commerce_receipts (
  webhook_id UUID PRIMARY KEY,
  contract_id TEXT NOT NULL CHECK (
    contract_id = 'founder-control-room/shopify-money-path@v1'
  ),
  provider TEXT NOT NULL CHECK (provider = 'shopify'),
  store_fingerprint TEXT NOT NULL CHECK (
    store_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  shop_domain TEXT NOT NULL CHECK (
    shop_domain = 'vercel-store-93a908b0-wcrkkq76.myshopify.com'
  ),
  order_ref_hash TEXT NOT NULL CHECK (order_ref_hash ~ '^[0-9a-f]{64}$'),
  event_type TEXT NOT NULL CHECK (event_type = 'payment_collected'),
  revenue_state TEXT NOT NULL CHECK (revenue_state = 'payment_collected'),
  collected_value_cents INTEGER NOT NULL CHECK (
    collected_value_cents BETWEEN 1 AND 100000000
  ),
  currency TEXT NOT NULL CHECK (currency = 'USD'),
  offer_keys TEXT[] NOT NULL DEFAULT '{}',
  unknown_offer_count INTEGER NOT NULL DEFAULT 0 CHECK (
    unknown_offer_count BETWEEN 0 AND 1000
  ),
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fcr_commerce_receipts_order_time_idx
  ON public.fcr_commerce_receipts (order_ref_hash, occurred_at DESC);

CREATE INDEX IF NOT EXISTS fcr_commerce_receipts_event_time_idx
  ON public.fcr_commerce_receipts (revenue_state, occurred_at DESC);

ALTER TABLE public.fcr_commerce_receipts ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies are created. The Shopify webhook endpoint
-- verifies the provider HMAC and exact FCR store identity, then persists with
-- the server-side service-role client.
