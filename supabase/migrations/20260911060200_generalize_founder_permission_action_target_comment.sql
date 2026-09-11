-- Forward-only documentation correction for the existing founder permission
-- action_target column. Do not rewrite the historical migration that created
-- the column because it may already exist in provider migration history.
--
-- This changes database metadata only when separately applied. It does not
-- grant execution authority or mutate any stored founder decision.

comment on column public.founder_permission_requests.action_target is
  'Structured action identity used by the broker request hash. Each supported consequential action must bind its exact target and mutable evidence identities; merge binds repo/PR/base/head, while PromptOS workflow-registry promotion binds canonical repo/branch/head, workflow and registry content hashes, paths, provider identity, capability version, and consequence class.';
