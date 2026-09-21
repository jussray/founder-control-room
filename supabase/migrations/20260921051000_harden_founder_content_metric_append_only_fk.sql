-- Preserve founder-content metric observations as append-only evidence even when
-- a lifecycle post is removed. Parent deletion must never cascade into evidence loss.

begin;

alter table public.founder_content_metric_observations
  drop constraint if exists founder_content_metric_post_founder_fk;

alter table public.founder_content_metric_observations
  add constraint founder_content_metric_post_founder_fk
  foreign key (post_id, founder_user_id)
  references public.founder_content_posts(post_id, founder_user_id)
  on delete restrict;

commit;
