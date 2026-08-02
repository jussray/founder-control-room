# Social campaign safety reconciliation

## Reality

The merged campaign-classification slice was draft-only, but four post-merge review findings remained:

1. classifications were not bound to the repository and exact head they authorized;
2. an explicit `blocked_pending_output_safeguard` mode could fall through into eligible ecosystem drafts;
3. repository-specific `neverClaim` and `neverExpose` rules were not enforced against public copy;
4. media-required and externally limited platforms could not carry media or a verified character limit into the publisher contract.

## Fix

- bind every classification to `authorizedRepository` and `authorizedExactHead`;
- fail closed on the explicit blocked mode;
- reject draft material containing configured claim or exposure bans;
- require a verified character limit where the platform capability has no built-in limit;
- require media for media-dependent platforms;
- carry both fields into the existing first-party draft validator;
- preserve `mode: draft`, `publishAllowed: false`, and `founderApprovalId: null`.

## Proof gate

Do not merge until the exact PR head passes TypeScript, focused unit tests, repository CI, and zero unresolved review threads.

## Rollback

Revert the PR. No provider, CRM, Buffer, Zapier, deployment, or publishing mutation is included.
