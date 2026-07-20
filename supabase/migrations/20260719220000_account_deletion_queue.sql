-- Migration: account_deletion_queue
-- Backs ACCOUNT_DELETION.md compliance proof

-- 1. deletion_queue
CREATE TABLE IF NOT EXISTS public.deletion_queue (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  status       text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  error        text
);

ALTER TABLE public.deletion_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON public.deletion_queue
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_deletion_queue_status
  ON public.deletion_queue (status)
  WHERE status = 'pending';

-- 2. trusted_devices
CREATE TABLE IF NOT EXISTS public.trusted_devices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id   text NOT NULL,
  fingerprint text,
  verified_at timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);

ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_only" ON public.trusted_devices
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.purge_stale_devices()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.trusted_devices WHERE last_seen < now() - INTERVAL '90 days';
$$;

-- 3. Anonymize audit_logs on user deletion
CREATE OR REPLACE FUNCTION public.anonymize_user_audit_logs(p_user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.audit_logs
  SET actor_id = NULL, actor_email = '[deleted]'
  WHERE actor_id = p_user_id;
$$;

-- 4. Soft-delete column on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
