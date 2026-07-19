# Founder Control Room Vision

Founder Control Room is the provider-independent authority and evidence layer for managing Se’kret Bip, L99, commerce projects, and future repositories.

## North star

Give the founder one trusted place to understand project truth, integrate appropriate repository work, authorize separately gated high-risk actions, inspect proof, and recover from failure without making GitHub, Supabase, or any AI provider the permanent owner of the operating system.

## Product promises

1. **Founder authority is explicit.** Evidence-backed merges may use the standing authority in `docs/FOUNDER_MERGE_AUTHORITY.md`. Deployment, migration, rollback, auth, secrets, billing, deletion, publication, and external actions remain separate gates.
2. **Projects keep their own data boundaries.** Control Room receives narrow operational evidence, not broad copies of private product data.
3. **Providers remain adapters.** GitHub is the first repository provider. Model and infrastructure providers remain replaceable.
4. **Evidence outranks summaries.** Current repository state, CI, runtime observations, schemas, and approved decisions beat model memory.
5. **Every material action is auditable and recoverable.** The system records what was requested, approved, executed, verified, and rolled back.

## Current product stage

The repository now contains an operational foundation with founder authentication and allowlisting, a dashboard shell, project and mission routes, approvals, terminal and agent surfaces, provider abstractions, audited reads, and live Supabase-backed operational views.

It is not automatically authorized to deploy, migrate databases, change authentication, spend funds, delete materials, publish, or act externally merely because repository code is merged.

## Success condition

The founder can answer five questions for every project:

1. What is true?
2. What is risky?
3. What is approved?
4. What happened?
5. How do we recover?
