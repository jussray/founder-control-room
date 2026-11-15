-- Forward-only one-application-per-lesson hardening.
-- A direct service-role insert must not bypass the single-winner principle
-- even before the atomic RPC moves RETAINED to APPLIED.
create unique index learning_applications_one_per_lesson_idx
  on public.learning_applications(learning_id);
