# Architecture Decision: Builder Prompt Workflow Router

Decision: use one provider-neutral, deterministic workflow selector that composes existing FCR control modes.

Rejected:
- another standalone prompt app;
- keyword-driven execution from raw user/external text;
- a new database-backed orchestration system;
- provider-specific authority rules;
- coupling PromptOS template CRUD to execution approval.

Reason: the pure selector is local-first, testable, reversible, provider-neutral, and keeps capability separate from authority.
