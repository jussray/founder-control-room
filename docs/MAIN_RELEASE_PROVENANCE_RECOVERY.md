# Main Release Provenance Recovery

Founder Control Room treats a direct or otherwise unproven commit on `main` as historical source state, not as reviewed release provenance.

This recovery path is intentionally narrow and creates no runtime capability:

1. Do not weaken, bypass, or special-case `scripts/verify-main-release-provenance.mjs` to bless a direct commit after the fact.
2. Do not manufacture an associated pull request, review receipt, or release receipt for historical direct-main lineage.
3. Preserve that lineage as repository history and evidence.
4. Start the recovery carrier from the current authoritative `main` head.
5. Keep the recovery change documentation-only so provenance repair cannot smuggle unrelated product, authority, provider, or runtime changes through the gate.
6. Advance `main` only through a normal pull request whose exact head satisfies the repository's applicable review, CI, security, and merge rules.
7. After merge, require the new current `main` head to have current exact-head evidence and a valid merged-pull provenance relationship before making a present-tense release claim.
8. If `main` moves before merge, the recovery candidate must be refreshed or replaced from the new current head. Predecessor green evidence does not transfer automatically.
9. A recovery carrier whose intended diff is already present on current `main` is `SUPERSEDED`; it must carry a new bounded reviewable recovery change or stop, because an empty or already-landed diff cannot establish successor reviewed provenance.

## Current recovery receipt

- carrier: PR #764 `fix(release): recover current main provenance`
- observed authoritative base: `main@399265d476184ceef12ed39f53829256e6455810`
- predecessor carrier head: `6f3f0aa4329e6e8bc338b9c71de458be4ec1141b`
- history-preserving reconciliation commit: `b162e7c9e52950457c9a92ce8509d90e818855b0`
- reconciliation method: two-parent commit whose effective tree exactly equals the observed current `main` tree
- intended successor diff: this documentation-only receipt
- predecessor CI, browser, review, runtime, and continuity proof: historical only; not inherited by the successor
- current successor exact-head proof: **PENDING** until the refreshed carrier completes its applicable CI, security, continuity, and Playwright lanes
- inherited direct-main lineage: historical source state only; not retroactively certified by this receipt
- merge authority: **false** until the refreshed exact head is current to `main`, required checks and review membranes are satisfied, and founder authority is present
- deploy/provider/database/credential/migration/publication authority: **false**

If `main` moves from `399265d476184ceef12ed39f53829256e6455810` before integration, this receipt becomes `STALE/SUPERSEDED`. Reconcile this same carrier to the new authoritative base, expire predecessor proof, and reacquire the applicable evidence instead of creating a replacement recovery PR.

This recovery proves only the provenance of the successor reviewed merge. It does not retroactively certify predecessor direct commits, and it grants no deploy, publication, provider mutation, database, billing, credential, migration, or other execution authority.

If the recovery pull request cannot pass the normal merge membrane, `main` remains provenance-blocked. Report the blocker rather than weakening the verifier.
