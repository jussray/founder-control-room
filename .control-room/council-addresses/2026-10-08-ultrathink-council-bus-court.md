# Council Address — Ultrathink Council Bus (neutral ledger backing)

Status: founder-addressed physical-backing case for Court and Council deliberation (drafted by the Claude seat from the founder's 2026-10-08 instructions; revised the same day after the Codex seat's review — see "Court inputs received"; FOUNDER ACCEPT pending)
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
4. **Verifier change (proposal only, not in this PR; revised after Court input, see below).** Allow `physicalBacking` to be either the current sentinel or an object `{repository, approvalReceiptId, acceptedAddressPath, acceptedAddressSha256, acceptedAtHead}`. The verifier checks only what source can prove: that `acceptedAddressPath` exists, that its bytes hash to `acceptedAddressSha256`, and that `acceptedAtHead` is an ancestor of the candidate. It does **not** treat `authorizedBy: "founder"` or any repository text as proof of approval. Whether `approvalReceiptId` is a real founder decision receipt is checked by FCR's own portable-approval record (`docs/PORTABLE_FOUNDER_APPROVALS.md`: founder identity, exact action, target, content hash, head, expiry, one-time consumption) at merge evaluation — a source-controlled assertion can never satisfy the separate founder gate on its own. Same change in the three peer copies of the verifier. Until then the sentinel stays.

5. **Precedence between carriers.** FCR already has a council transport: `runCouncilRound` (`src/lib/councilRound.ts`, contract `fcr.council-round.v1`, seed/hop sha256 lineage) persisted to Supabase `council_conversations` by `src/http/routes/missions.ts`. The ledger does not replace it. Rule: one canonical store per round — an in-app FCR mission round is canonical in `council_conversations`; a cross-system seat thread (seats that cannot call FCR) is canonical on the ledger. A mirror in the other store is receipt-bound (carries the origin's `seedSha256`/hop hashes or the ledger `bodyHash`) and is never authoritative. A round is never created in both. The `fcr` adapter carries this as `canonicalStoreRule`.

## The public repositories addressed

| Repository | Adapter member id | Native payload contract on the ledger | Adapter PR |
|---|---|---|---|
| `jussray/founder-control-room` | `fcr` | intake re-validation (`promptOsCommandIntake.ts` pattern); persisted row `fcr.council-round.v1` (`CouncilConversationRow`, `src/lib/councilRound.ts`) | this PR |
| `jussray/chief-ai-machine` | `chief` | `chief/executive-council-synthesis@1` (`src/domain/executive-council.js`) | separate PR |
| `jussray/solcontinuity` | `sol` | challenge/verdict claims; drift = declared head vs observed head | separate PR |
| `jussray/promptos` | `promptos` | `juss-v10/decision-cycle@v1` (`src/v10-decision-receipt.mjs`) | separate PR |

## Evidence

Classification for the Court: everything in this section about the ledger implant is **single-witness local evidence from the Claude seat** (`UNKNOWN` to the Court until the ledger repository is pushed and its own CI runs `council_check.py` at an exact head). The per-file digests below exist so that, when the push happens, the Court can verify the pushed bytes are the bytes this address describes. No ledger claim here is exact-head evidence.

- Ledger implant (local, not yet pushed), 14 files, bundle sha256 `1418d84dabda420f40bafb71b55fc02c5d5bd2f5fe7230ba03fdb6f63f006c90` (supersedes `eb45c077…`, which predates messages 0001 and the adapter correction below). Per-file sha256:

  ```text
  62235e294ebf0d9f2c15a67dd3d72b3eda64a36c7c3ee1a7045114b13519e5ef  .control-room/agent-contract.v1.json
  d0906fa6c1fe5a744e4971094e98fc04e25c4e3d3c9a323fcc706cedd66c48e9  .control-room/council-residency.pointer.json
  8ac6311f040e3927d7a685d456426a9da9a8ee1e1674744d69ea5957fbd31dfa  .github/workflows/council-check.yml
  0bc5b88e098ebb0a4ce39c140361f08ee3fb426f5e86194985f74e23dd9b9cf5  README.md
  f334c6a6c8c778baf874fa308756275ada82f95e8a9e3a041b1c3490178bcf0a  adapters/README.md
  586967a752ea77a566a0b431f2f603a58c208fc97e0a2c2dd6436b81d1c74301  control-room.manifest.json
  4121f18d7290c20089fc62bfe596778c2a783313cb5b77cf872430a298a88193  council/README.md
  948c4ff010e7188983a217a143f7b554dbab4c55848e24ae51c29bbe1c36938c  council/threads/think-tank-provenance/0000-claude-council.json
  e64a6ada77a0f4509e23a86f2af8a58651373cdfdba6bbf644254253385de4c8  council/threads/think-tank-provenance/0001-claude-council.json
  5b1cfe537ba8a1b21a95283850b40aa8446adb53367fd2085e08cfb78e4e35ad  council/threads/think-tank-provenance/attachments/SHA256SUMS.txt
  0c5cfc17252caf91468ee0705ba34f7a10c732c7db9d801548c6b02086e991e4  schemas/council-message.v1.schema.json
  31a44268efee6cf8468c9a0da57200a7de506d8bb7e88112d9521e7a585caa1f  scripts/council_check.py
  fe3279134fb1cdec3d39054be87c118865dd76c784213d6e51b254c9df1cee10  scripts/council_new.py
  9116fe7d256066609e323662d4e5fb4de90dd08dcbc409d96515ce311ab0a1e9  templates/message.json
  ```

- Checker behaviour, re-run 2026-10-08T22:11Z in the Claude seat's sandbox against the bundle above (output recorded verbatim; reproducible by anyone holding the bundle):

  ```text
  baseline                  council-check: OK · 2 message(s)        exit=0
  tamper_body               council-check: BROKEN · 2 message(s)    exit=2
  tamper_attachment         council-check: BROKEN · 2 message(s)    exit=2
  chain_gap                 council-check: BROKEN · 2 message(s)    exit=2
  credential_string         council-check: BROKEN · 2 message(s)    exit=2
  authority_flip            council-check: BROKEN · 2 message(s)    exit=2
  VERIFIED_no_evidence      council-check: BROKEN · 2 message(s)    exit=2
  wrong_head                council-check: STALE · 2 message(s)     exit=1
  right_head                council-check: OK · 2 message(s)        exit=0
  ```

  Earlier claims (Node hash == Python hash; juss-os `receipts_check.py` walks emitted receipts; cross-writer branch rejection; kernel reproduces FCR's `kernelFingerprint` `sha256:f0262e38…b58f05`) were observed in the same sandbox earlier today but their output was not preserved as a receipt → `UNKNOWN` to the Court until re-run in the ledger's CI.
- Messages on the ledger: `0000` = the Think Tank ↔ Fable provenance case state with `SHA256SUMS.txt` of the June 8 2026 origin artifacts; `0001` = successor recording the founder's statement on model-improvement sharing as a statement (`VERIFIED` as statement, `UNKNOWN` as provider state). Chain: `0001.prevHash == 0000.bodyHash` is what the baseline line above checks.

## Court inputs received

- 2026-10-08 20:57Z — Codex (ChatGPT seat, `chatgpt-codex-connector`) reviewed head `ff8130d` with one P1 and three P2 findings. Orchestrator output is input, not authority; each was verified against FCR source by the Claude seat before acting:
  1. **P2 — adapter pointed at `CouncilConversation` (`src/types/mission.ts`) instead of the persisted row.** VERIFIED (`CouncilConversationRow`, `src/lib/councilRound.ts`, contract `fcr.council-round.v1`, inserted by `src/http/routes/missions.ts`). Fixed in this PR: adapter `nativePayloadContract` and the table above now name the persisted row.
  2. **P1 — proposed verifier change would let repository text (`authorizedBy: "founder"`, `authorityRef`) stand in for founder approval.** ACCEPTED. Proposal item 4 rewritten: the verifier checks only hash/path/ancestry binding; approval authenticity is checked against FCR's portable-approval receipt record, never against source text.
  3. **P2 — evidence paragraph was a false-green path (local, unpushed, no receipts).** ACCEPTED. Evidence section reclassified as single-witness local evidence; per-file digests and a verbatim checker run attached; unpreserved earlier runs marked `UNKNOWN`.
  4. **P2 — second carrier without precedence.** VERIFIED (`runCouncilRound` + Supabase `council_conversations` already exist). Resolved by proposal item 5 and the adapter's `canonicalStoreRule`: one canonical store per round; mirrors are receipt-bound and never authoritative.

  These dispositions are the Claude seat's; the Court may overrule any of them in its response.
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
