# Zapier GitHub Metadata Contract

## Purpose

Use Zapier's GitHub integration as a deterministic read/write metadata layer, not as the GitHub Actions workflow runtime.

This contract separates three capabilities that must never be blended:

1. **Repository metadata:** repositories, branches, files, issues, pull requests, comments, and their identifiers.
2. **Zapier workflow runtime:** Zap definition, run history, filters, mappings, retries, and downstream app steps.
3. **GitHub Actions runtime:** workflow runs, jobs, step logs, artifacts, check conclusions, and rerun controls.

A successful read or write in one layer does not prove execution in either of the other layers.

## Zapier GitHub capabilities

Use deterministic search and lookup actions for one-shot reads:

```text
Find Repository
-> Get File Contents
-> Find Issue or Find Pull Request
-> Find Branch when branch identity matters
```

`Get File Contents` must retain the returned file content and SHA/metadata. A repo-content claim remains unverified when the relevant file was not read through a live GitHub lookup or another authoritative GitHub connector.

Use polling triggers such as `New Pull Request`, `New Issue`, or similar `New ...` events only for live automations. Do not reuse them as deterministic one-shot reads. Polling triggers deduplicate items by unique identifier and may correctly refuse to emit a record that Zapier has already seen.

## Allowed GitHub writes through Zapier

When the connected GitHub action exposes them and the exact write is authorized, Zapier may:

- create an issue;
- create a comment;
- update pull-request metadata;
- create other non-destructive repository metadata supported by the connected action.

Every write must retain repository, issue or PR number, URL, timestamp, source signal, and rollback or correction path.

Zapier GitHub metadata access does not authorize merge, deployment, branch deletion, credential changes, ruleset changes, or bypassing protection checks.

## GitHub Actions boundary

Do not claim that Zapier's GitHub app can read Actions job logs, download workflow logs, inspect every check artifact, or rerun workflow jobs unless the active connector explicitly exposes that exact operation and returns a receipt.

For Actions runtime work, use an authoritative GitHub Actions path such as:

- GitHub's workflow-run and job APIs;
- a GitHub connector that exposes workflow jobs, steps, logs, artifacts, or rerun operations;
- GitHub's own Actions UI;
- a scoped webhook or API bridge designed for Actions evidence.

GitHub documents workflow and job reruns as GitHub Actions operations. Their existence in GitHub does not imply that Zapier's GitHub app exposes them.

## Failure-triage path

When Zapier cannot inspect the workflow runtime, use this bounded substitute:

```text
GitHub Actions or deploy failure email
-> Gmail lookup
-> ChatGPT structured summary
-> deterministic GitHub repository/PR lookup
-> Create Issue or Create Comment
-> Founder Control Room evidence
```

The issue or comment should contain only non-secret evidence:

```text
Repository:
Branch:
Head SHA:
Workflow name:
Run URL:
Run ID, when known:
Failing job or stage:
Exact safe error excerpt:
Classification:
Impact:
First repair gate:
Source email or connector receipt:
```

An email summary is triage evidence, not a substitute for Actions logs when exact logs are available through GitHub.

## Repository operating pattern

For every managed repository:

1. `Find Repository` before assuming identity or access.
2. `Get File Contents` for the exact docs or configuration that control the decision.
3. `Find Issue` or `Find Pull Request` for live work state.
4. Use `Create Issue`, `Create Comment`, or an explicitly exposed update action for bounded metadata writes.
5. Escalate Actions runtime questions to GitHub Actions tooling, not speculative Zapier repairs.

## Repository tiers

Revenue and public-growth repositories may use GitHub metadata with HubSpot and Buffer for review-first release-note workflows after the evidence gate passes.

Teen wellness, private family, journal, voice, or sensitive repositories must remain on the GitHub/Gmail/ChatGPT evidence path unless a separately approved privacy-safe marketing contract exists. Do not route private or sensitive content into HubSpot, Buffer, or public promotion.

For `jussray/founder-control-room`, Zapier may stage metadata changes such as issues, comments, and draft/review tasks. It must not auto-merge because workflow execution, protection checks, and exact-head verification live outside the Zapier GitHub metadata layer.

## Evidence labels

Every conclusion must separate:

```text
VERIFIED
INFERRED
UNKNOWN
BLOCKED
```

Minimum proof labels:

- repository lookup proves repository metadata only;
- file lookup proves the returned file content and SHA only;
- PR or issue lookup proves that object's returned state only;
- Zapier run receipt proves the named Zapier execution only;
- Actions job logs prove the named job/step failure only;
- Gmail failure notice proves the sender reported a failure, not the complete runtime cause;
- created issue/comment receipt proves the metadata write only.

## Expansion path

Close the runtime gap with a scoped Webhooks/API path for GitHub Actions status, jobs, logs, artifacts, and rerun requests. Add native Stripe, Shopify, and Supabase/Postgres connections only for repositories whose product and privacy contracts permit those systems.

Until those paths are verified, standardize on deterministic `Find/Get` reads and bounded `Create Issue` or `Create Comment` failure handling.

## Sources

- GitHub: Re-running workflows and jobs: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs
- Zapier: GitHub integrations: https://zapier.com/apps/github/integrations
- Zapier Platform: Deduplication: https://docs.zapier.com/integrations/build/deduplication
- Zapier Help: Duplicate data in Zap workflows: https://help.zapier.com/hc/en-us/articles/8496260269965-How-Zapier-handles-duplicate-data-in-Zap-workflows

## Rollback

Disable the affected Zap or metadata write step, correct or close the created issue/comment without deleting evidence, and return runtime operations to the authoritative GitHub Actions path.