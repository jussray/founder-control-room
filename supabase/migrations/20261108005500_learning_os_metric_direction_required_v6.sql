-- Forward-only Learning OS v6: PostgreSQL CHECK accepts UNKNOWN (NULL).
-- A demonstrated metric improvement must identify its comparison direction.
-- The constraint intentionally validates existing rows and fails closed if
-- any existing "improvement" has no direction; no data is rewritten.
ALTER TABLE public.learning_application_reviews
  ADD CONSTRAINT learning_improvement_requires_direction_v6
  CHECK (NOT demonstrated_improvement OR better_when IS NOT NULL);
