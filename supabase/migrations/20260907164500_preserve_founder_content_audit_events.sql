-- Preserve founder-content lifecycle audit evidence even if a parent post is deleted.
-- The original lifecycle migration used ON DELETE CASCADE, which could erase the
-- append-only event history through a parent-row delete. Replace that relationship
-- with a restrictive foreign key so deletion fails while evidence still exists.

alter table public.founder_content_post_events
  drop constraint if exists founder_content_post_events_post_id_fkey;

alter table public.founder_content_post_events
  add constraint founder_content_post_events_post_id_fkey
  foreign key (post_id)
  references public.founder_content_posts(post_id)
  on delete restrict;

comment on constraint founder_content_post_events_post_id_fkey
  on public.founder_content_post_events is
  'Audit-retention membrane: parent founder-content posts cannot be deleted while lifecycle events reference them.';
