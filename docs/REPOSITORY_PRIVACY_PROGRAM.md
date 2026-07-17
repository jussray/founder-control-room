# Repository Privacy and Sanitation Program

**Status:** proposed execution policy  
**Owner:** Juss Ray  
**Observed:** 2026-07-17  
**Tracking:** issue #27

## Decision

The portfolio operates under this rule:

> Private by default. Sanitized always. Public only by deliberate export.

Repository visibility and sanitation are separate controls:

- **Privacy** limits ongoing access to canonical code, strategy, prompts, architecture, and operational history.
- **Sanitation** removes secrets, private data, unsafe artifacts, and accidental exposure from both private and public repositories.

A private repository is not a credential vault. A sanitized repository is not automatically suitable for public release.

## Operating model

```text
Private canonical repository
→ reviewed publication boundary
→ clean export with new history
→ public showcase or storefront repository
```

Do not create public mirrors by copying the canonical Git history. Public releases should be purpose-built exports containing only intentionally public material.

## Current target state

### Private canonical repositories

- `jussray/Sekret-Bip`
- `jussray/chief-ai-machine`
- `jussray/l99-StoryEngine`
- `jussray/founder-control-room`
- `jussray/promptos`
- `jussray/jbh-private`
- `jussray/untold-stories-storefront` while under active development
- all private refactor, backup, vendor, admin, and operations repositories

### Public only by explicit purpose

- `jussray/jussbeautifulhair-site` may remain public only if public source code creates a named business, hiring, community, or portfolio benefit.
- future showcase repositories may contain screenshots, videos, fake-data demos, selected documentation, and high-level architecture summaries.

### Quarantine and archive

- `jussray/sekret-bip-demo`: make private; rebuild a clean fake-data showcase later.
- `jussray/do-not-use`: make private, confirm no unique recovery value, then archive.
- legacy and duplicate repositories: keep private and archive once canonical ownership is verified.

## Visibility execution

The connected GitHub integration cannot change repository visibility. Visibility changes therefore require a manual founder action:

1. Open the repository in GitHub.
2. Go to **Settings → General → Danger Zone**.
3. Select **Change repository visibility**.
4. Change the repository to **Private** and confirm its name.
5. Re-check collaborators, Actions, Pages or Cloudflare builds, deploy keys, webhooks, environments, branch rules, and external integrations.
6. Record evidence in issue #27.

Changing visibility must not be marked complete until repository metadata confirms the new state and deployment integrations still work.

## Sanitation requirements

Audit each canonical repository across all of these surfaces:

### Current tree

- `.env` and local-development files;
- API keys, tokens, service-role keys, OAuth secrets, webhook secrets, signing keys, and bearer headers;
- customer, vendor, founder, employee, or user exports;
- real teen journals, voice, video, identity, Bridge content, or safety signals;
- private prompts, internal roadmaps, pricing strategy, vendor sourcing, and privileged admin controls;
- production URLs or identifiers that materially increase attack surface;
- generated build output, database dumps, archives, and device backups.

### Git history

- removed secrets and historical `.env` files;
- binary attachments and archives;
- commits from abandoned experiments;
- tags and releases that retain sensitive content;
- copied production configuration.

### GitHub surfaces

- issues, pull requests, comments, screenshots, and attachments;
- Actions logs and downloadable artifacts;
- releases and packages;
- branch names and commit messages containing sensitive data;
- GitHub Pages or preview deployments;
- deploy keys, webhooks, environments, variables, and secrets.

Any credential ever exposed must be rotated. Removing it from the current branch is not remediation.

## Public-release gate

A repository may be public only when all conditions are met:

1. A named public purpose exists.
2. The repository has a clean, intentionally public history.
3. All data is fake or explicitly approved for publication.
4. No canonical private prompts, internal roadmaps, migrations, privileged controls, vendor/customer data, or production credentials are present.
5. Secret scanning and publication checks are enabled.
6. A maintainer owns updates and removal.
7. Provider outages or repository removal do not break the canonical product.
8. The public repository is reviewed as an independent product surface, not assumed safe because files were copied from a private repo.

## Supabase boundary

Repository privacy does not replace database authorization.

The 2026-07-17 live security-advisor review found:

- Se’kret Bip still has a broad classification and denial-testing program for anonymous-capable policies and authenticated-callable `SECURITY DEFINER` RPCs. Track under `jussray/Sekret-Bip#399`.
- Founder Control Room has four RLS-enabled tables with no policies that require classification as service-only denial-by-default or narrow founder access. Track under issue #28.

No live SQL or Auth setting was changed during the repository-privacy audit.

## Evidence contract

For each repository, retain:

- current and target visibility;
- canonical, showcase, legacy, or quarantine classification;
- sanitation scan date and scope;
- findings and remediation owner;
- credential rotation evidence where applicable;
- deployment smoke-check result after visibility changes;
- public-purpose statement for anything left public;
- archive or deletion decision for duplicates.

## Rollback and recovery

- Do not rewrite history before creating a verified recovery point.
- Do not delete duplicate repositories until canonical content and unique assets are reconciled.
- Do not rotate production credentials without mapping every dependent runtime and rollback path.
- Do not merge publication changes directly into product repos without tests.
- If a visibility change breaks deployment, restore integration access without making the canonical repo public again unless no safer route exists.

## Completion criteria

The program is complete when:

1. all canonical IP repositories are private;
2. all repositories have sanitation evidence;
3. exposed credentials are rotated;
4. duplicates are archived or deliberately retained;
5. public repositories have a clear purpose and clean publication boundary;
6. deployments continue from private repositories where required;
7. Supabase authorization findings remain separately tracked and tested;
8. Founder Control Room can report repository status without storing credentials or private repository content.