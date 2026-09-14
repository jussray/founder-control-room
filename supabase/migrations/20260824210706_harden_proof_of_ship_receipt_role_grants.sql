-- Keep proof-of-ship receipts service-role only at the table privilege layer.
-- RLS already has no anon/authenticated policies; these explicit revokes remove
-- unnecessary public-role capabilities instead of relying on RLS alone.

REVOKE ALL PRIVILEGES
ON TABLE public.proof_of_ship_receipts
FROM anon, authenticated;
