-- Add Shopify's provider-native merchant-action identity to the pre-activation
-- FCR commerce ledger without rewriting the already-executed base migration.
-- X-Shopify-Event-Id is shared across deliveries produced by the same merchant
-- action, while X-Shopify-Webhook-Id identifies only an individual delivery.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fcr_commerce_receipts LIMIT 1) THEN
    RAISE EXCEPTION
      'fcr_commerce_event_identity_requires_empty_preactivation_ledger';
  END IF;
END
$$;

ALTER TABLE public.fcr_commerce_receipts
  ADD COLUMN IF NOT EXISTS event_id UUID;

ALTER TABLE public.fcr_commerce_receipts
  ALTER COLUMN event_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fcr_commerce_receipts_provider_event_uidx
  ON public.fcr_commerce_receipts (
    provider,
    shop_domain,
    event_id
  );

COMMENT ON COLUMN public.fcr_commerce_receipts.event_id IS
  'Shopify merchant-action identity shared across deliveries; non-secret and not authority by itself.';
