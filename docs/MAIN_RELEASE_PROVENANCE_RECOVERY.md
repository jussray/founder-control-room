# Main Release Provenance Recovery

Founder Control Room treats a direct or otherwise unproven commit on `main` as historical source state, not as reviewed release provenance.

The recovery rule is intentionally narrow:

1. Do not alter `scripts/verify-main-release-provenance.mjs` to bless a direct commit after the fact.
2. Do not manufacture an associated pull request, review receipt, or release receipt for the historical direct commit.
3. Preserve the direct commit and its descendants as repository history.
4. Create a bounded recovery branch from the current `main` head.
5. Advance `main` only through a normal pull request whose exact head is reviewed and whose applicable checks pass.
6. After that pull request is merged, require the new current `main` SHA to be the merge commit associated with exactly one merged pull request targeting `main`.
7. Re-run Main Release Provenance on that new exact head before reusing any present-tense release claim.

This recovery proves only the provenance of the successor merge commit. It does not retroactively convert predecessor direct commits into reviewed PR merges, and it does not grant deploy, provider-mutation, publication, database, billing, or other execution authority.

If the recovery pull request cannot satisfy the repository's normal merge membrane, `main` remains provenance-blocked. The correct response is to report the blocker rather than weaken the verifier.
