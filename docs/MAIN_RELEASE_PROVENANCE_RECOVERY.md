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
- observed authoritative base: `main@bbd187dd4297227072c0f933e2c91d9b3031f717`
- predecessor carrier head: `2fafb4b2addf55cac329d8708a39744b3dc515fb`
- reconciliation commit: `2381a21dadb89f356105356462843802501cb066`
- reconciliation method: history-preserving two-parent commit whose effective tree equals the observed current `main` tree
- intended successor diff: this documentation-only receipt
- predecessor source, CI, browser, review, and runtime proof: historical only; not inherited by the successor
- unresolved direct-main-range P1: **BLOCKED**; this receipt does not review, certify, relabel, or launder the inherited direct-main interval
- qualifying historical-range review: still required before this carrier can establish a provenance-clean successor
- merge authority: **false** until the exact successor head has fresh applicable machine/browser proof, the direct-main review debt is actually satisfied, all required review/authority membranes are current, and founder authority is present
- deploy/provider/database/credential/migration/publication authority: **false**

If `main` moves from `bbd187dd4297227072c0f933e2c91d9b3031f717` before integration, this receipt becomes `STALE/SUPERSEDED`. Reconcile the same carrier to the new authoritative base, expire predecessor proof, and reacquire the applicable evidence instead of creating a replacement recovery PR.

This recovery proves only the provenance of the successor reviewed merge. It does not retroactively certify predecessor direct commits, and it grants no deploy, publication, provider mutation, database, billing, credential, migration, or other execution authority.

If the recovery pull request cannot pass the normal merge membrane, `main` remains provenance-blocked. Report the blocker rather than weakening the verifier.
