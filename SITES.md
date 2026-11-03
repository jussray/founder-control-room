---
schema: juss/chatgpt-sites-repository-binding@v1
project_id: founder-control-room
canonical_repository: jussray/founder-control-room
canonical_branch: main
authority_repository: jussray/founder-control-room
site_identity_status: unverified
site_origin: null
account_owner: unverified
chatgpt_site_url: null
custom_domain: www.foundercontrolroom.org
control_room_link: https://www.foundercontrolroom.org/control-room/
last_verified: "2026-09-06"
verification_source: "founder directive establishes www.foundercontrolroom.org as the intended public domain; ChatGPT Site identity and provider publication/readback remain pending"
continuity_status: UNKNOWN
---

# ChatGPT Sites repository binding — Founder Control Room

This file defines the repository-side contract for a ChatGPT `@Sites` surface representing Founder Control Room. It does not create a Site, prove a Site is connected, or prove a publication occurred.

## Cross-account continuity

The frontmatter is the repository-side continuity record for this Site. `account_owner` identifies only a verified editor-account binding and must not expose private account-holder identity. `chatgpt_site_url`, `custom_domain`, `control_room_link`, `last_verified`, and `verification_source` must come from the authority that can actually observe them. `continuity_status` is one of `VERIFIED`, `UNKNOWN`, `STALE`, or `SUPERSEDED`.

Unknown stays unknown. Chat memory, another phone/account, a naming convention, DNS intent, or a repository guess must never upgrade an unverified field. The Site editor/account is authoritative for Site identity/publication, the canonical repository for project/source truth, Cloudflare for DNS/deployment truth, and Founder Control Room for cross-project authority/evidence registry truth.

## Canonical source

The Site must treat `jussray/founder-control-room` as the only canonical Founder Control Room repository and resolve the current `main` head at use time. Memory, an old Site snapshot, an old PR, a generated page, or another repository must never replace current repository/provider evidence.

Before material planning, editing, publication, deployment, cross-repository coordination, or a current-state claim, read and apply the current versions of:

- `AGENTS.md`
- `AGENTS_FOUNDER_INTELLIGENCE.md`
- `GLOBAL_AI.md`
- `CHATGPT.md`
- `docs/FOUNDER_INTELLIGENCE_CONSTITUTION.md`
- `docs/FOUNDER_MERGE_AUTHORITY.md`
- `docs/TRUTH_DECAY_AUDIT.md`
- `docs/PUBLIC_COMMUNICATION_TRUTH_CONTRACT.md`
- `docs/FOUNDER_GITHUB_WORKSPACE.md`
- `.control-room/plugin-management.json`
- `.control-room/repository.manifest.json`
- `config/founder-intelligence.inheritance.json`

Stricter repository-local rules always win.

## Read contract

A Site may read public-safe repository material needed to render a founder-facing projection, but must:

1. resolve the canonical repository and current `main` head first;
2. preserve exact source provenance for material claims;
3. distinguish repository truth, CI truth, provider truth, deployment truth, runtime truth, and human outcomes;
4. fail closed on missing, stale, superseded, conflicting, or unverifiable evidence;
5. never expose credentials, private prompts, raw private evidence, private metrics, customer/user content, internal provider payloads, security-sensitive implementation, or proprietary Sauce Guard material merely to render a Site.

## Write contract

A Site may prepare repository-backed changes only through a focused branch and pull request created from freshly resolved `main`.

The Site must never:

- push ordinary implementation directly to `main`;
- force-push;
- delete files, branches, evidence, or founder material;
- treat its own output, a prompt, or a previous Site snapshot as approval;
- merge around required exact-head proof, review, Documentation Truth, or founder-final authority;
- silently turn a repository write into deployment, publication, provider mutation, migration, credential change, billing, DNS, or another separately gated action.

Every write must preserve unrelated work and include repository, base, branch, exact head, changed paths, verification state, rollback, and the next authority gate.

## User-supplied command-center Site candidate (not provider verified)

The founder supplied `https://fcr-command-center.jussray.chatgpt.site` as a command-center Site address on 2026-11-03. This is a **user-reported candidate**, not proof of Site ownership, publication, runtime binding, DNS configuration, or access control. `site_identity_status`, `chatgpt_site_url`, `account_owner`, and `continuity_status` stay unchanged until verified by the Site editor/runtime.

The repository now includes a **disabled-by-default** read-only `GET /site/command-center/bootstrap` route. It requires issuer-verified, resource-bound OAuth bearer tokens; an exact configured founder Auth UUID plus the existing founder allowlist is required for owner role. Owner requests return a link to the first-party authenticated Control Room, **never founder workspace data**. Other authenticated accounts receive only their tenant-scoped public project summaries (empty for an unprovisioned account, 503 when storage is unavailable). Neither account receives execution authority.

Deployment prerequisites are **separate**: verify this exact Site's account/editor binding; configure the Site's OAuth authorization-code/PKCE flow with the exact audience `https://api.foundercontrolroom.org/site/command-center` and approved client ID; establish a server-side `FCR_COMMAND_CENTER_OWNER_USER_ID` from verified Supabase Auth (never a guessed email); configure the exact Site Origin in `FOUNDER_ALLOWED_ORIGINS` *only after site verification*; validate the first-party owner route's Cloudflare Access and session gates; then enable `FCR_COMMAND_CENTER_SITE_ENABLED=true` after customer tenant/RLS and two-account browser tests pass. The ChatGPT Site host is not automatically covered by Cloudflare Access policies for `foundercontrolroom.org`.

Do not use `SameSite=Strict` owner cookies as cross-site authentication; do not put credentials in frontend code; do not reveal private founder data through the Site; do not treat this source implementation as a published Site or a production security guarantee.

## Site publication contract

A Site identity is executable only after the ChatGPT Sites runtime exposes and verifies that exact Site identity. No slug, hostname, project ID, or generated URL may be guessed from naming conventions.

For this repository, the founder has established `www.foundercontrolroom.org` as the intended public domain. The underlying `chatgpt.site` identity, editor-account binding, and live publication readback remain unverified in repository evidence. Therefore this file authorizes no live Site mutation by itself.

When a Site identity becomes verified, publication must bind to the intended exact repository state, re-read the required Markdown authority chain, apply Sauce Guard, and capture an observable Site/runtime artifact after publication. A successful repository commit, PR, merge, workflow trigger, or Site editor save is not publication proof by itself.

## Cross-project boundary

Founder Control Room remains the portfolio governance, evidence, approval, and guarded execution authority. Chief and PromptOS may be presented as public-safe product screens inside the Founder Control Room public face, but neither screen may expose private founder state or promote itself into portfolio authority. A project Site may expose only the bounded actions its own repository contract permits. No Site may use another project as an alternate source of truth.

## Stop conditions

Stop rather than improvise when the Site identity is unverified, the canonical repository cannot be resolved, `main` moved after proof, required Markdown authority cannot be read, a privacy/Sauce Guard boundary is unclear, or the requested action crosses a separate deploy/publication/credential/data/destructive gate without its exact authority.
