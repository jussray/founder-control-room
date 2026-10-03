-- Reconcile the existing L99 primary Git connection with the authoritative
-- StoryEngine repository. Preserve every other non-secret config field.
-- This is intentionally idempotent and does not create a connection if one is
-- missing; missing provider wiring remains a separate fail-closed condition.

update public.project_connections as pc
set
  config = jsonb_set(
    coalesce(pc.config, '{}'::jsonb),
    '{repository}',
    to_jsonb('jussray/StoryEngine'::text),
    true
  ),
  updated_at = now()
from public.projects as p
where pc.project_id = p.id
  and p.slug = 'l99'
  and pc.connection_type = 'git'
  and pc.label = 'primary'
  and pc.status = 'active'
  and pc.config ->> 'repository' is distinct from 'jussray/StoryEngine';
