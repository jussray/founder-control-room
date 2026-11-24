# Member project drafts — source candidate

Ordinary members use `/welcome` and their existing revocable member session. The member workspace now has an outcome form, a private project list, and project resumption through `/member/?project=<id>`. Members can create a project title and goal, reload it, and save another version. This is private draft persistence, not agent execution, repository creation, payment, deployment, or founder authority.

The new routes are `GET /auth/member/projects`, `POST /auth/member/projects`, `GET /auth/member/projects/:id`, and `PATCH /auth/member/projects/:id`. Ownership comes only from the verified member session and is constrained on every database query. Body-supplied owner fields are rejected. Project mutations require the existing same-origin browser gate; this cookie-only router rejects Bearer headers so they cannot bypass that gate. Current founder accounts cannot use the member project surface. The existing empty `/auth/member/me` envelope stays compatible and is not used as a project store.

The additive migration `20261105000000_member_projects.sql` creates `fcr_member_projects` only in FCR's app-specific database. RLS is enabled and direct public, anonymous, and authenticated role access is revoked. The trusted server service role has only select/insert/update; the API must keep its owner filters because service-role queries bypass RLS. No founder project table is queried. Do not store credentials or sensitive customer, family, teen, journal, or health content in this draft surface.

Saves use the displayed version to prevent overwriting concurrent edits. A stale or unavailable project produces a conflict, while failed or unconfirmed saves retain the form contents. Authentication and project responses remain private/no-store. The browser renders titles and goals as text or input values, never HTML.

Release gates remain separate: execute focused integration tests and browser proof on the final candidate; apply and inspect the migration in isolated preview; review the app-specific live Supabase schema/grants and provider source mapping; obtain the applicable exact-candidate integration and migration/deployment authority. This document describes source behavior and does not assert a live migration or production release.

Rollback: revert the source increment to the prior member-only entry, leaving additive draft rows intact. No deletion or database rollback is part of this change.
