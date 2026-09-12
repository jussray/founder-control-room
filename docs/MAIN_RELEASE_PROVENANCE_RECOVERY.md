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

- carrier: PR #764 `fix/release: recover current main provenance`
- observed base: `main@05e083f491cb870b835ab39bed683bceb5c87616`
- predecessor carrier head: `cb823d45817ba9f7937357021fb5cf71d8e8dfca`
- reconciliation commit: `d67c6069c9e6889bbf1e0e5a9d912d3061767adf`
- reconciliation method: history-preserving two-parent commit whose effective tree equals the observed current `main` tree
- intended successor diff: this documentation-only receipt
- predecessor source/CI/browser proof: historical only; not inherited
- merge authority: false until the exact successor head satisfies the repository's normal proof, review, and authority membrane
- deploy/provider/database/credential authority: false

This receipt exists to make the recovery carrier reviewable without retroactively blessing the direct-main interval. If `main` moves before integration, this receipt becomes `STALE/SUPERSEDED` and the carrier must reconcile to the new authoritative base before any merge decision.

This recovery proves only the provenance of the successor reviewed merge. It does not retroactively certify predecessor direct commits, and it grants no deploy, publication, provider mutation, database, billing, credential, migration, or other execution authority.

If the recovery pull request cannot pass the normal merge membrane, `main` remains provenance-blocked. Report the blocker rather than weakening the verifier.
