# Founder Control Room Global AI Contract

## Parent operating contract

Before nontrivial work, read [`Juss Founder OS`](.ai/skills/juss-founder-os/SKILL.md).
For Se’kret Bip acquisition, splash, preview, waiting-list, sponsorship, or social launch work, also read [`Juss Private Operating Plan`](docs/private/JUSS_PRIVATE_OPERATING_PLAN.md).
For repository integration decisions, read [`Founder Merge Authority`](docs/FOUNDER_MERGE_AUTHORITY.md).
For code-quality expectations, read [`Agent Quality Standard`](docs/AGENT_QUALITY_STANDARD.md).
For agent-requested command execution, read [`Founder Command Bridge`](docs/FOUNDER_COMMAND_BRIDGE.md).
For repository read/edit/write work, read [`Founder GitHub Workspace`](docs/FOUNDER_GITHUB_WORKSPACE.md).
For stale-current-claim failures, read [`Truth Decay Audit`](docs/TRUTH_DECAY_AUDIT.md).
For public founder communication, read [`Public Communication Truth Contract`](docs/PUBLIC_COMMUNICATION_TRUTH_CONTRACT.md).

The Founder OS is the private parent skill. This file specializes it for Founder Control Room. Repository-specific rules may become stricter, but they may not weaken founder authority, brand/IP protection, privacy, evidence, temporal truth, rollback, non-deletion, Sauce Guard, or truthfulness.

## Founder reasoning stack

Use these as **parallel reasoning lenses with serialized authority**:

```text
ULTRATHINK
+ Product Design
+ Data Analytics
+ Redteam I
+ Lindy
+ L99
+ OODA
+ Hormozi
+ Bill Gates
+ Elon Musk
+ Redteam II
```

The historical shorthand remains a compatibility alias for existing skills/verifiers:

```text
/garyvee lindymode redteam l99 redteam ooda
```

The alias preserves older routing vocabulary only. It does not replace the expanded reasoning stack, add authority, or make any named persona a source of truth.

Repeated Redteam passes are intentional.

1. **ULTRATHINK** — decompose cross-repository, provider, authority, privacy, production, documentation, and temporal dependencies before mutation.
2. **Product Design** — test whether the founder/user surface makes state, uncertainty, next gate, accessibility, recovery, and historical-vs-current truth understandable.
3. **Data Analytics** — define observation-only measurements that distinguish capability, configuration, execution, outcome, and stale truth. Analytics may observe; it may never approve, renew truth, or expand authority.
4. **Redteam I: premise** — attack whether the requested control, automation, integration, or communication should exist and whether the evidence supports it.
5. **Lindy screen** — prefer provider-independent interfaces, portable data, Git primitives, explicit contracts, reversible changes, and boring infrastructure where boring wins.
6. **L99 systems pass** — inspect authority, provenance, state transitions, event history, provider boundaries, approvals, evidence, temporal validity, release gates, failure modes, rollback, and drift.
7. **OODA** — re-observe, orient around the founder goal and current bottleneck, decide one reversible path, act minimally, verify, and loop.
8. **Hormozi value pass** — increase desired-outcome clarity and evidence-backed likelihood while reducing time delay, founder effort, cognitive load, and maintenance burden. Never invent demand, traction, or revenue.
9. **Bill Gates pass** — identify the bottleneck, highest-leverage correction, reusable standard, and what must not be scaled yet.
10. **Elon Musk pass** — question requirements, delete unnecessary complexity before optimizing it, simplify the remaining path, shorten feedback loops without weakening proof, and automate only a stable path.
11. **Redteam II: solution** — attack the chosen implementation for false greens, stale truth, privilege expansion, sauce leakage, duplicate authority, provider drift, rollback gaps, and ways a future agent could mistake yesterday's truth for today's.

Parallel thinking never grants parallel mutation authority. Repository writes, merges, deployments, provider mutations, credentials, publication, spending, and destructive actions stay serialized behind their exact gates.

## Implementation discipline

The operating stack governs implementation, not merely planning or final summaries.

For every material implementation keep this sequence visible:

```text
Goal
→ Reality
→ ULTRATHINK
→ Product Design + Data Analytics
→ Redteam I
→ Lindy
→ L99
→ OODA
→ Hormozi
→ Bill Gates
→ Elon Musk
→ Implement
→ Proof
→ Redteam II
→ Documentation truth
→ Rollback
→ Next gate
```

Implementation rules:

- Inspect before editing.
- Search for existing interfaces, providers, routes, schemas, events, docs, and historical decisions before adding another.
- Preserve unrelated work and history.
- Prefer focused, reversible patches over broad rewrites.
- Re-observe after every meaningful edit, test result, review, merge, provider write, or documentation transition.
- Map code paths to explicit guardrails, evidence sources, temporal validity, and approval boundaries.
- Treat compilation as syntax evidence, tests as behavioral evidence, CI as repository workflow evidence, provider readback as provider evidence, and runtime observation as deployment evidence. None substitutes for all the others.
- A pull-request Quality Gate must checkout and verify `github.event.pull_request.head.sha` in every job; a successful synthetic PR merge-ref run is merge-simulation evidence, never exact-head candidate proof.
- FCR CI must keep the secret-free exact-head Cloudflare bridge authority contract load-bearing inside `Required Gate`; that repository check does not substitute for live Cloudflare or GitHub provider readback.
- Never code around an unknown provider state, schema state, credential state, review state, or failed workflow merely to make a patch appear complete.
- Delete duplicate authority and dead workflow paths before adding another abstraction, credential, retry, or dashboard.
- Do not remove behavior merely to make tests pass.
- Do not expose or hardcode secrets.
- Report behavior changed, tests actually run, failures/skips, security/provider impact, rollback, unresolved risk, truth age, documentation state, and next approval gate.

## Truth order

1. Repository, branch, deployed configuration, provider state, and runtime actually inspected now.
2. Current tests, logs, schemas, provider readback, API responses, and observed behavior.
3. Explicit current founder decisions and approved records.
4. Current official provider documentation.
5. Historical repository/provider evidence whose exact identity and time boundary are preserved.
6. Prior summaries, generated plans, old PR bodies, old issues, chat memory, and assumptions.

Never claim a file, feature, test, branch, merge, deployment, approval, publication, provider action, or business outcome exists without evidence.

A claim may have been true and still be unsafe to reuse as current truth. Preserve the historical observation and re-observe before consequential present-tense use.

## Truth Lease and FutureYou / ME safety

A hash proves identity, not continuing reality. Facts that can decay must be treated as leased truth rather than permanent memory.

At merge, deploy, schedule, publish, completion-claim, provider, and launch boundaries:

1. identify the exact claim and load-bearing dependencies;
2. re-observe the authoritative repository/provider/runtime/human-outcome state;
3. classify the claim as current, stale, invalidated/superseded, historical, or unknown;
4. use present-tense operational language only while the required evidence is current;
5. preserve old evidence without promoting it back into present authority;
6. never let Current You preference override contradictory objective evidence; and
7. never let FutureYou guidance become evidence or approval.

Use the generic Truth Lease where no equivalent or stronger domain-specific temporal gate exists. Preserve stronger gates such as exact-head repository verification and founder-content execution-time temporal revalidation.

## Documentation truth

README files, current-state docs, PR descriptions, issues, AI operating prompts, and runbooks can influence future decisions. They are part of the control surface.

For truth-sensitive architecture, authority, publishing, capability, provider, workflow, deployment, or launch changes:

- refresh `README.md` and the applicable current-state docs in the same bounded change;
- mark contradictory older material historical/superseded or point it to the newer authority rather than deleting provenance;
- run `Documentation Truth` on the exact PR head;
- require Documentation Truth inside CI / Required Gate;
- run it again on merged `main`;
- bind default test-discovery debt to the exact base so a candidate cannot launder a new excluded test into its own baseline; and
- re-read provider/runtime truth after merge before reusing present-tense production claims.

Do not hard-code a durable “current main SHA” into prose and pretend it renews itself. Exact SHAs belong in receipts and historical evidence; current identity is resolved at use time.

A docs-only truth-sync merge closes an earlier drift cycle. Its post-merge verification receipt closes that transition without requiring another self-referential docs edit.

## Founder-owned progress publishing and Sauce Guard

Founder Control Room should be able to publish verified progress **about Juss's own products from Juss's own product** without publishing the private recipe.

Canonical separation:

```text
verified product/repository evidence
→ Chief proposes public-safe channel-native story
→ Sauce Guard removes private machinery
→ temporal truth revalidation
→ exact Current You authority for the executable route
→ first-party provider or bounded n8n/Zapier orchestration
→ provider readback
→ FCR outcome receipt
→ observation-only analytics
```

Public-safe copy may explain what changed, what problem was solved, what was learned, why the progress matters, approved public proof, and an honest unresolved gate.

Keep private prompts, hidden instructions, raw diffs, credentials, private provider payloads, internal evidence references, customer/private data, private metrics, unreleased roadmap detail, security-sensitive implementation, and proprietary mechanics behind Sauce Guard.

LinkedIn may use the stronger first-party FCR path. Other supported destinations may use provider-neutral n8n/direct adapters only when actually configured and proven. Zapier/Buffer may remain bounded connector or scheduling helpers where useful. Draft support is not provider capability; orchestration acceptance is not publication truth; provider readback remains terminal external-state evidence.

Investor email remains separate. Never auto-send without both the applicable standing policy and recipient-specific qualification.

## Control Room boundaries

- The Control Room is provider-independent. GitHub is the current repository provider, not permanent constitutional infrastructure.
- The Control Room uses its own Supabase project and credentials. It must not borrow Se’kret Bip service-role credentials or directly query Bip’s private database with broad access.
- Bip may send curated, minimized operational events. The Control Room must not become a shadow copy of teen journals, voice, media, parent visibility, or emotional-safety data.
- Founder authorization requires both a valid session and founder allowlist. Authentication alone is not authorization.
- Every material read, proposal, approval, integration, deployment, rollback, publication, and provider action should leave an auditable event.
- No authority class silently grants another.

## FCR merge review boundary

The canonical in-app FCR merge path uses **deterministic independent review followed by authenticated founder-final approval**. It requires exact provider PR identity, exact-head machine proof, canonical diff/policy hashes, a passed deterministic exact-head review witness, P2 blocking, an authenticated founder-final receipt pinned to the exact PR/base/head, and a final mutable-head re-read before provider integration.

The deterministic review receipt remains proposal-only and cannot authorize the merge. Founder final approval is the separate human authority layer and must never be described as independent review. New founder-final approvals use a server-owned policy with zero required semantic humans and cannot be weakened by caller-supplied policy.

Deterministic witness production is itself a narrow server-owned provider operation. `src/review/deterministicReviewProducer.ts` must derive review identity and verdict from provider-observed state; `src/review/deterministicReviewWitnessPublisher.ts` may publish only a clear derived receipt through `RepositoryProvider.publishDeterministicReviewWitness(...)`; and Founder Control Room production construction may expose that write only from a repository-scoped installation token minted by server-owned `GITHUB_APP_ID` plus `GITHUB_PRIVATE_KEY`. A PAT-only `GITHUB_TOKEN` fallback cannot mint deterministic review evidence. After publication, the exact-head signal must be read back and its provider-recorded App issuer must equal the trusted numeric `GITHUB_APP_ID`. None of these operations supplies founder-final or merge authority, and a candidate that changes this trust root cannot certify itself through the same producer.

The live ignition for this path must run from exact current `main`, never from candidate-controlled pull-request workflow code. The trusted default-branch dispatch and its runner use the production GitHub App boundary, retain the deterministic receipt plus provider readback as evidence, and are themselves P1 trust roots. If either changes, the normal deterministic producer must block self-certification and require the separately explicit bootstrap/constitutional path.

The older `FCR_TRUSTED_SEMANTIC_REVIEWER_IDS` policy is compatibility-only for missions already pinned under the prior non-author semantic-review model. It is not a prerequisite for new canonical founder-final approvals.

This source/runtime membrane does **not** prove the live GitHub repository ruleset independently enforces the same protections. Required approvals, stale-review dismissal, last-push approval, review-thread requirements, strict status freshness, and bypass actor/mode configuration are separate live-provider facts requiring current GitHub readback.

Never use a GitHub merge that occurred outside the in-app FCR path as proof that the in-app founder-final contract executed.

## Provider roles

- **Claude / Claude Code** — long-context repository analysis, structured implementation, careful refactors, and documentation.
- **Codex / ChatGPT** — debugging, code review, data analysis, repository operations, and founder-readable synthesis.
- **OpenAI Platform** — replaceable server-side model capability behind adapters; never client-side keys.
- **Anthropic Platform** — replaceable server-side model capability; model context is not durable memory.
- **Perplexity** — current public research and source discovery, not private runtime truth.
- **GitHub** — source control, review, CI evidence, and provider provenance; a merge is not proof of deployment or of the FCR in-app merge path.
- **Supabase** — Control Room authentication and operational storage within this project’s own trust boundary.
- **n8n** — bounded multistep orchestration after FCR truth/authority; never founder approval or terminal provider truth.
- **Zapier / Buffer** — bounded connector/scheduling helpers where useful; never constitutional truth authority.
- **HubSpot** — CRM/relationship metadata and bounded workflows; repository truth, outreach authority, and project completion remain separate.
- **Cloudflare** — deployment/runtime/provider evidence; a successful build is not production/runtime proof.

## Non-negotiable rules

- Preserve provider abstraction and project separation.
- Keep tokens, service-role credentials, founder sessions, provider secrets, and privileged model calls off public clients, logs, docs, screenshots, and public posts.
- Do not weaken auth, allowlisting, RLS, audit logging, independent review, tests, types, release gates, temporal truth, Documentation Truth, Sauce Guard, or rollback to make a check green.
- Do not silently change provider ownership, project registry semantics, event schemas, approval states, deployment targets, or current founder intent.
- Do not treat model output as approval, authorization, repository truth, provider truth, or a permanent Truth Lease.
- Merge only under `docs/FOUNDER_MERGE_AUTHORITY.md`; merge authority never silently authorizes a separately gated action.
- For nontrivial code changes, run `npm run typecheck` and `npm test` before claiming readiness, or explicitly report why they could not run.
- Agents may request command execution through Command Bridge, but they must not receive a raw shell or bypass founder direction.
