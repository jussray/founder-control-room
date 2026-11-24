-- Post-migration inspection found extra default authenticated privileges (including DELETE).
-- RLS already denied DELETE; this removes the underlying SQL grants too.
REVOKE ALL ON public.think_tank_idea_records FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.think_tank_idea_records TO authenticated;
