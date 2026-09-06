---
schema: juss/chatgpt-sites-repository-binding@v1
project_id: founder-control-room
canonical_repository: jussray/founder-control-room
canonical_branch: main
authority_repository: jussray/founder-control-room
site_identity_status: unverified
site_origin: null
---

# ChatGPT Sites repository binding — Founder Control Room

This file defines the repository-side contract for a ChatGPT `@Sites` surface representing Founder Control Room. It does not create a Site, prove a Site is connected, or prove a publication occurred.

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

## Site publication contract

A Site identity is executable only after the ChatGPT Sites runtime exposes and verifies that exact Site identity. No slug, hostname, project ID, or generated URL may be guessed from naming conventions.

For this repository, the Site identity is currently `UNVERIFIED` in repository evidence. Therefore this file authorizes no live Site mutation by itself.

When a Site identity becomes verified, publication must bind to the intended exact repository state, re-read the required Markdown authority chain, apply Sauce Guard, and capture an observable Site/runtime artifact after publication. A successful repository commit, PR, merge, workflow trigger, or Site editor save is not publication proof by itself.

## Cross-project boundary

Founder Control Room remains the portfolio governance, evidence, approval, and guarded execution authority. A project Site may expose only the bounded actions its own repository contract permits. No Site may promote itself into portfolio authority or use another project as an alternate source of truth.

## Stop conditions

Stop rather than improvise when the Site identity is unverified, the canonical repository cannot be resolved, `main` moved after proof, required Markdown authority cannot be read, a privacy/Sauce Guard boundary is unclear, or the requested action crosses a separate deploy/publication/credential/data/destructive gate without its exact authority.
