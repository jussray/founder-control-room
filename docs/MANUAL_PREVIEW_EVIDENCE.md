# Manual Preview Evidence

Manual preview evidence is a temporary bridge for a repository whose normal Control Room Worker, GitHub App scan, or private GitHub-hosted runner cannot yet execute.

It is not signed automation and is never presented as default-branch production proof.

## When to use it

Use a manual preview import only when all of the following are true:

1. the repository is registered in Founder Control Room;
2. the repository identity and exact branch commit were inspected through an authenticated provider;
3. check results were inspected at that same exact commit;
4. the packet contains only sanitized operational evidence;
5. the founder understands that the evidence is temporary and unsigned;
6. a future signed/default-branch scan is expected to supersede it.

Do not use a preview import to bypass a failing real check, to hide an unprovisioned runner, or to label an unmerged branch as production.

## Required environment

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

These must belong to the standalone Founder Control Room project, never a product project.

## Create the packet

Copy the example:

```bash
cp examples/repository-preview-evidence.example.json /tmp/project-preview.json
```

Fill in:

- registered Control Room project slug;
- exact provider/repository identifier;
- exact branch;
- exact commit SHA;
- manifest identity:
  - `github_blob_sha` for the GitHub blob identity returned by the provider; or
  - `sha256` when a real SHA-256 digest was calculated;
- founder-reviewed evidence description;
- required check states;
- capability states;
- evidence paths and usage assertion IDs;
- failed check/usage IDs;
- open findings;
- explicit finding fingerprints to resolve, when appropriate.

Never include:

- source file contents;
- usage assertion marker text;
- commit messages or PR text;
- names or email addresses;
- credentials or tokens;
- raw logs;
- customer/user/product data;
- private database rows.

## Import

```bash
npm run preview:evidence -- /tmp/project-preview.json
```

The importer:

1. looks up the project by slug;
2. verifies provider/repository identity against the registry;
3. validates the exact commit and manifest identity format;
4. validates checks, capabilities, paths, usage assertion ID subsets, and findings;
5. writes a `runner` verification record with:
   - `signature_verified = false`;
   - runner mode `preview_branch_import`;
   - exact branch/commit;
   - manual evidence description;
6. updates capability evidence;
7. opens or updates only findings present in the packet;
8. resolves only fingerprints explicitly listed in `resolvedFindingFingerprints`;
9. records an operational preview event;
10. creates no mission.

The output states:

```json
{
  "evidenceKind": "manual_preview",
  "signatureVerified": false,
  "missionsCreated": 0
}
```

## Finding resolution rule

Missing findings are not automatically resolved.

To resolve one finding, list its exact fingerprint:

```json
{
  "resolvedFindingFingerprints": [
    "check:typecheck"
  ]
}
```

A fingerprint cannot appear in both `findings` and `resolvedFindingFingerprints` in the same packet.

## Mission rule

The importer never creates missions.

After import, the founder may review the finding in `/control-room` and choose **Prepare repair mission**. That creates a `proposed` mission only. Branch creation, patch commits, integration, deployment, rollback, secret access, paid commitments, and destructive work remain separately approval-gated.

## Supersession rule

A signed active scan or signed repo-runner packet should supersede manual preview evidence as soon as available.

Manual preview evidence must remain visibly labeled by:

- `signature_verified = false`;
- evidence kind `manual_preview`;
- runner mode beginning with `preview_branch_`;
- its exact preview branch rather than an implied production branch.

Do not change those labels to make a dashboard look healthier.
