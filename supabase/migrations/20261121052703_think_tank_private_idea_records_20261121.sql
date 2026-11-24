-- Additive Think Tank vault in existing FCR identity project.
-- Do not modify founder tables or their policies. All records are private by default.
CREATE TABLE IF NOT EXISTS public.think_tank_idea_records (
  id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL,
  record jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT think_tank_title_size CHECK (char_length(title) BETWEEN 1 AND 4000),
  CONSTRAINT think_tank_record_size CHECK (octet_length(record::text) <= 1000000),
  CONSTRAINT think_tank_revision_positive CHECK (revision > 0),
  CONSTRAINT think_tank_record_id CHECK (record->>'id' = id::text),
  CONSTRAINT think_tank_record_schema CHECK (record->>'schemaVersion' = 'IdeaRecordV1'),
  CONSTRAINT think_tank_record_title CHECK (record->>'idea' = title)
);
ALTER TABLE public.think_tank_idea_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.think_tank_idea_records FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.think_tank_idea_records FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.think_tank_idea_records TO authenticated;
CREATE INDEX IF NOT EXISTS think_tank_ideas_owner_updated
  ON public.think_tank_idea_records (owner_user_id, updated_at DESC);

CREATE POLICY think_tank_owner_select ON public.think_tank_idea_records
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = owner_user_id
    AND coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false) = false);
CREATE POLICY think_tank_owner_insert ON public.think_tank_idea_records
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = owner_user_id
    AND coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false) = false);
CREATE POLICY think_tank_owner_update ON public.think_tank_idea_records
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = owner_user_id
    AND coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false) = false)
  WITH CHECK ((select auth.uid()) = owner_user_id
    AND coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false) = false);
-- Deliberately no DELETE policy, no public listing, no sharing policy.