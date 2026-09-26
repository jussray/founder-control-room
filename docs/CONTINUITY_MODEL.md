# Unified Work + Deployment Continuity v1

Founder Control Room governs two complementary continuity laws.

## Active work continuity

`docs/PR_CONTINUITY.md` remains authoritative for active branches and pull requests.

When a trusted base moves, eligible active same-repository work rolls forward conflict-free. A rollover creates a successor head, and predecessor CI, review, runtime, Playwright, provider, artifact, and candidate-specific approval evidence expires. The successor head becomes the new proof subject.

## Deployment proof continuity

`docs/DEPLOYMENT_CANDIDATE_LEASE.md` governs an already-proven deployment candidate.

An exact approved candidate may remain deployable after `main` advances only when every intervening path is explicitly classified as non-deploying by that repository's fail-closed `.deployment-authority.json` policy. Runtime, config, dependency, migration, workflow, authority, packaging, publication, or unknown drift revokes the lease and requires a new proven candidate.

## Combined rule

```text
ACTIVE WORK
  main/base moves
    -> roll forward
    -> successor head
    -> predecessor proof/approval expires
    -> re-prove successor

PROVEN DEPLOYMENT CANDIDATE
  main moves
    -> classify drift
       -> explicit safe non-deploying drift: candidate lease survives
       -> runtime/config/authority/unknown drift: candidate lease revoked
          -> new candidate only after fresh proof
```

## Non-substitution law

- Candidate leases never excuse active work from rolling forward.
- PR rollover never proves that an older deployment artifact changed.
- Exact SHAs remain identity anchors for both the current work proof subject and the deployed candidate.
- Work continuity and deployment-proof continuity are separate receipts and separate authority questions.

## Fail-closed behavior

- Unknown rollover state blocks automatic branch mutation.
- Merge conflicts block automatic rollover.
- Any active-work head movement expires predecessor proof and candidate-specific approvals.
- Unknown deployment drift revokes the deployment candidate.
- Changing `.deployment-authority.json`, the candidate guard, deployment workflow, build graph, or authority policy is deployment-sensitive and requires fresh proof.

## Executable proof

`scripts/continuity_model_guard.py` creates a temporary Git history and proves both laws together:

1. active work gets a successor head after the base moves;
2. the successor contains the new trusted base;
3. docs-only drift can preserve an older deployment candidate when the repo policy explicitly allows it; and
4. runtime drift revokes the same candidate.

This contract is the portfolio control-plane model. Individual repositories may narrow safe drift further, but may not weaken fail-closed behavior by copying another repo's allowlist without build/deploy evidence.
