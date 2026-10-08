# Council Address — Ultrathink Council Bus (neutral ledger backing)

Status: founder-addressed physical-backing case for Court and Council deliberation (drafted by the Claude seat from the founder's 2026-10-08 instructions; FOUNDER ACCEPT pending)
Date: 2026-10-08
Authoritative control room: `jussray/founder-control-room`
Observed FCR main before address: `36e2620ab1526d6acb0570e43fc9e9e777bb04a9`
Proposed ledger repository: `JussAndCo/Ultrathink-council-bus` (private; created by the founder 2026-10-08)
Authority ceiling: research, challenge, reconcile, specify, and propose. Do not merge, deploy, publish, spend, change credentials, grant provider access, or mutate any repository's authority contract from this address alone.

## Founder address

Court and Council,

Give the neutral shared Council layer a physical backing so the seats can talk to each other through my own project instead of through my clipboard, and make the backing face Founder Control Room, Chief, Sol and PromptOS through the seams they already have.

Do not create another governance system. One kernel (`juss/agent-contract@v1`), one authority chain, one law layer (juss-os v3, canonical in `jussray/ULTRATHINK-`). The ledger carries messages, evidence, receipts, fingerprints and lineage. It executes nothing and authorizes nothing.

Founder instructions this address is drafted from (chat, 2026-10-08 ET): "can you and chat just talk to each other through one of my projects on GitHub like I designed?" (15:37) · "Implant to face chief sol and promptos … while I make the new repo" (15:40) · "I name the repo Ultrathink council bus" (15:53) · "It's made … private … in my GitHub enterprise" (15:56–15:58) · "Approved cont" (15:59) · "Address the public repos too" (16:47).

## Verified repository baseline

| Repository | Role (residency contract) | Exact head observed 2026-10-08 |
|---|---|---|
| `jussray/founder-control-room` | founder operating/build intelligence; authority host | `36e2620ab1526d6acb0570e43fc9e9e777bb04a9` |
| `jussray/chief-ai-machine` | executive synthesis/reasoning; reasoning host | `36a0701aaffecad187434e3609500aa388a58500` |
| `jussray/solcontinuity` | challenge/evaluation/continuity | `0c0164462f3de5e9e934a58cf5d13375b71dfc5d` |
| `jussray/promptos` | prompt/workflow compiler/routing; behavior host | `11e4a2ad525300bee39ea56a8314bf3d951bd5de` |
| `JussAndCo/Ultrathink-council-bus` | proposed neutral ledger/transport | `UNKNOWN` — repository exists per founder; not yet visible to the Claude GitHub App on the JussAndCo organization (`BLOCKED`) |

`.control-room/council-residency.contract.json` in all four public repositories reads `physicalBacking: "UNDECIDED_UNTIL_SEPARATELY_AUTHORIZED"`, and `scripts/verify-protected-intelligence-contract.mjs` (line 69 in FCR) fails closed if that value changes. That gate is correct and is the reason this address exists: it is the separate authority gate.

## What is proposed

1. **Physical backing.** `JussAndCo/Ultrathink-council-bus` becomes the ledger/transport for `juss/founder-council-federation@v2`. Owned by the founder, not by any core system or provider. Private.
2. **Transport contract.** `juss/council-message@v1`: one JSON message per file under `council/threads/<thread>/NNNN-<from>-<to>.json`; phase seam; exact-head state; claims labelled `VERIFIED | INFERRED | UNKNOWN | BLOCKED | FAIL`; authority fixed to `decisionOwner: founder`, `grantsExecutionAuthority: false`; `bodyHash` computed exactly as FCR's `fingerprint()` in `src/lib/promptOsCommandHandoff.ts`; proof cookie chained to the predecessor; head movement expires present-tense claims. Writer branch `council/<member>/<thread>`; PR to `main`; the merge records, it never approves.
3. **Peer adapters.** Each public peer gains `.control-room/council-bus.adapter.json`: member id, write-branch pattern, native payload contract, and the rule that the ledger is not a runtime dependency. Status `proposed` until this address is accepted.
4. **Verifier change (proposal only, not in this PR).** Allow `physicalBacking` to be either the current sentinel or an object `{repository, authorizedBy: "founder", authorizedAt, authorityRef}` whose `authorityRef` names an accepted file in `.control-room/council-addresses/`. Same change in the three peer copies of the verifier. Until then the sentinel stays.

## The public repositories addressed

| Repository | Adapter member id | Native payload contract on the ledger | Adapter PR |
|---|---|---|---|
| `jussray/founder-control-room` | `fcr` | intake re-validation (`promptOsCommandIntake.ts` pattern); `CouncilConversation` storage | this PR |
| `jussray/chief-ai-machine` | `chief` | `chief/executive-council-synthesis@1` (`src/domain/executive-council.js`) | separate PR |
| `jussray/solcontinuity` | `sol` | challenge/verdict claims; drift = declared head vs observed head | separate PR |
| `jussray/promptos` | `promptos` | `juss-v10/decision-cycle@v1` (`src/v10-decision-receipt.mjs`) | separate PR |

## Evidence

- Ledger implant (local, not yet pushed): 14 files; `scripts/council_check.py` passes 11 adversarial checks (body tamper, attachment tamper, missing attachment, chain gap, credential string, wrong head, cross-writer branch); Node `JSON.stringify(canonicalize(body))` hash equals the Python hash; juss-os `receipts_check.py` walks the emitted receipts; the copied kernel reproduces FCR's `kernelFingerprint` `sha256:f0262e382adb0c65bd7d430db92584cdc31316b2c0bbff07bc9afea0bab58f05`. Bundle sha256 `eb45c077aa69d6afd8c03e27092ca1c07b1eb72a1f9db68191998a7edab165d6`.
- Message zero on the ledger: the Think Tank ↔ Fable provenance case state with `SHA256SUMS.txt` of the June 8 2026 origin artifacts.
- Baseline verifiers before this address (all exit 0): FCR `verify-protected-intelligence-contract.mjs`; Sol `verify-control-room-contract.mjs` + `verify-protected-intelligence-contract.mjs`; PromptOS `verify-protected-intelligence-contract.mjs`; Chief `verify-self-sufficient-architecture.mjs`. None enumerates `.control-room/`, so the adapter file is additive.

## Council seats

Smallest useful set: `chief` (synthesis), `sol` (challenge, drift), `promptos` (payload contract fit), `claude` (implementer, this draft), `chatgpt` (orchestrator seat — its write path via Codex is unproven until its first PR). Muse, DeepSeek and Perplexity review only if a seat disputes the contract.

## Court questions

1. Is GitHub, under the founder's own organization, an acceptable physical backing given the residency contract's warning against choosing a backing "merely because it is convenient"? The founder chose it explicitly; the question is whether any neutrality property is lost.
2. Does the transport contract leak anything through `payload` that the user boundary forbids (internal deliberation is not product data)?
3. Is the single-writer branch rule sufficient to preserve the one-writer-per-repo+branch+task invariant across seats that cannot open PRs themselves?
4. Should the ledger's message zero (the provenance case) remain in a private ledger, or move to a sealed thread with restricted readers?

## Required Court response

`ACCEPT` / `ACCEPT WITH CHANGES` / `HOLD`, bound to this file's path and this PR head, with: the named backing (or none), the verifier change the founder authorizes (or none), and which adapter PRs may merge.

## Stop condition

Stop if the Claude GitHub App cannot be granted the ledger repository, if any peer verifier goes red because of an adapter file, or if the Court holds. Nothing in this address or its PRs merges without the founder's exact approval bound to each PR head.

## What this address does not authorize

Merging any PR; changing `physicalBacking` or any verifier; installing or widening any GitHub App; provider credentials; the hourly loop writing to the ledger; publication of anything in the ledger.
