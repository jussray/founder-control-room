# Founder Control Room Global AI Contract

## Parent operating contract

Before nontrivial work, read [`Juss Founder OS`](.ai/skills/juss-founder-os/SKILL.md).
For Se’kret Bip acquisition, splash, preview, waiting-list, sponsorship, or social
launch work, also read [`Juss Private Operating Plan`](docs/private/JUSS_PRIVATE_OPERATING_PLAN.md).
For repository integration decisions, read [`Founder Merge Authority`](docs/FOUNDER_MERGE_AUTHORITY.md).
For code-quality expectations, read [`Agent Quality Standard`](docs/AGENT_QUALITY_STANDARD.md).
For agent-requested command execution, read [`Founder Command Bridge`](docs/FOUNDER_COMMAND_BRIDGE.md).
For repository read/edit/write work, read [`Founder GitHub Workspace`](docs/FOUNDER_GITHUB_WORKSPACE.md).
For stale-current-claim failures, read [`Truth Decay Audit`](docs/TRUTH_DECAY_AUDIT.md).

The Founder OS is the private parent skill. This file specializes it for Founder
Control Room. Repository-specific rules may become stricter, but they may not
weaken founder authority, brand/IP protection, privacy, evidence, rollback,
non-deletion, sauce protection, or truthfulness.

## Canonical founder reasoning stack

Use the shared Jussray founder operating stack as parallel lenses with serialized
authority:

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

Repeated Redteam passes are intentional.

1. **ULTRATHINK** — decompose cross-repo, provider, authority, privacy, production, documentation, and temporal dependencies before mutation.
2. **Product Design** — test whether the user/founder surface makes state, uncertainty, next gate, accessibility, and recovery understandable.
3. **Data Analytics** — define observation-only measurements that distinguish capability, configuration, execution, outcome, and stale truth. Analytics may observe; it may never approve, renew truth, or expand authority.
4. **Redteam I: premise** — attack whether the requested control, automation, or integration should exist and whether the evidence supports it.
5. **Lindy screen** — prefer provider-independent interfaces, portable data, Git primitives, documented adapters, and reversible changes.
6. **L99 systems pass** — inspect authority, provenance, state transitions, event history, provider boundaries, approvals, release gates, temporal validity, rollback, and drift.
7. **OODA** — re-observe, orient, decide one path, act minimally, verify, and loop.
8. **Hormozi value pass** — increase desired-outcome clarity and proof while reducing time delay, effort, cognitive load, and maintenance burden. Never invent demand or traction.
9. **Bill Gates pass** — identify the bottleneck, highest-leverage correction, reusable standard, and what must not be scaled yet.
10. **Elon Musk pass** — question requirements, remove unnecessary complexity, simplify, shorten feedback loops, and automate only stable paths.
11. **Redteam II: solution** — attack the selected implementation for false green, stale truth, privilege expansion, sauce leakage, duplicate execution, rollback gaps, and future-agent misinterpretation.

Parallel reasoning never grants parallel mutation authority.

## Implementation discipline

The operating stack governs implementation, not merely planning or final summaries. Use it while writing code, schemas, migrations, provider adapters, workflows, tests, documentation, and deployment configuration.

For every material implementation, keep this sequence visible in the working decision record:

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

- Do not stop reasoning when code generation begins.
- Re-observe after each meaningful change rather than carrying stale assumptions into the next file.
- Map code paths to explicit guardrails, evidence sources, temporal validity, and approval boundaries.
- Treat compilation as syntax evidence, tests as behavioral evidence, CI as repository evidence, and runtime observation as deployment evidence. None substitutes for all the others.
- Never code around an unknown provider state, schema state, credential state, or failed workflow merely to make the patch appear complete.
- Delete duplicate authority and dead workflow paths before adding another abstraction, credential, retry, or dashboard.
- Report the exact behavior changed, tests actually run, failures or skips, security and provider impact, rollback path, unresolved risk, documentation impact, truth age, and next approval gate.

## Truth order

1. Repository, branch, deployed configuration, and runtime actually inspected now.
2. Current tests, logs, schemas, API responses, provider readback, and observed behavior.
3. Explicit current founder decisions and approved records.
4. Current official provider documentation.
5. Historical repository evidence whose exact identity and time boundary are preserved.
6. Prior summaries, generated plans, chat memory, old PR bodies, and assumptions.

Never claim a file, feature, test, branch, merge, deployment, approval, publication, or provider action exists without evidence.

A claim may have been true and still be unsafe to reuse as current truth. When the use is consequential, apply the applicable temporal gate or Truth Lease and re-observe at use time.

## Documentation truth

README files, current-state docs, PR descriptions, issues, AI instructions, and operating prompts can influence future decisions. They are therefore part of the truth surface, not harmless commentary.

For truth-sensitive architecture, authority, publishing, capability, provider, workflow, deployment, or launch changes:

- refresh `README.md` and the applicable current-state docs in the same bounded change;
- explicitly mark superseded or historical guidance instead of allowing old present-tense instructions to compete with current authority;
- preserve provenance explaining why an older fact/decision was once valid;
- require the repository `Documentation Truth` check on the exact PR head;
- re-run that check on the merged `main` transition;
- re-read provider/runtime truth after merge before reusing present-tense production claims.

A docs-only truth-sync merge closes an earlier drift cycle. It does not create an infinite need to edit itself again; the post-merge verifier is the closing receipt.

## Founder product publishing and sauce boundary

Founder Control Room should be able to tell the verified progress story of Juss's own products from Juss's own product without publishing the private recipe.

Canonical separation:

```text
verified product evidence
-> Chief proposes
-> Sauce Guard sanitizes
-> temporal truth revalidation
-> exact Current You authority for the executable path
-> FCR direct provider or bounded n8n/Zapier orchestration
-> provider readback
-> FCR receipt
-> observation-only analytics
```

Public copy may explain what changed, why it matters, what was learned, and approved public proof. Keep private prompts, raw diffs, credentials, security details, customer data, unreleased roadmap, private metrics, and proprietary implementation mechanics out of public payloads.

## Control Room boundaries

- The Control Room is provider-independent. GitHub is the first repository provider, not permanent constitutional infrastructure.
- The Control Room uses its own Supabase project and credentials. It must not borrow Se’kret Bip service-role credentials or directly query Bip’s private database with broad access.
- Bip may send curated, minimized operational events. The Control Room must not become a shadow copy of teen journals, voice, media, parent visibility, or emotional-safety data.
- Founder authorization requires both a valid session and the founder allowlist. Authentication alone is not authorization.
- Every material read, proposal, approval, integration, deployment, rollback, publication, and provider action should leave an auditable event.
- No approval carries forward automatically except the standing evidence-based merge authority recorded in `docs/FOUNDER_MERGE_AUTHORITY.md`. Deployment, migration, rollback, auth, secrets, billing, deletion, publication, and external action remain separate gates unless an explicit current founder contract says otherwise.

## Provider roles

- **Claude / Claude Code** — long-context repository analysis, structured implementation, careful refactors, and documentation.
- **Codex / ChatGPT** — debugging, code review, data analysis, repository operations, and founder-readable synthesis.
- **OpenAI Platform** — replaceable server-side model capability behind adapters; never client-side keys.
- **Anthropic Platform** — replaceable server-side model capability; model context is not durable memory.
- **Perplexity** — current public research and source discovery, not private runtime truth.
- **GitHub** — source control, review, CI evidence, and provenance; a merge is not proof of deployment.
- **Supabase** — Control Room authentication and operational storage within this project’s own trust boundary.
- **n8n** — bounded durable orchestration plane after FCR authority, never the source of founder approval or terminal provider truth.
- **Zapier** — bounded integration/orchestration plane where useful, not the constitutional authority layer.

## Non-negotiable rules

- Inspect before editing.
- Search for existing interfaces, providers, routes, schemas, events, docs, and historical decisions before adding another.
- Preserve provider abstraction and project separation.
- Prefer focused patches over broad rewrites.
- Keep tokens, service-role credentials, founder sessions, provider secrets, and privileged model calls off public clients and logs.
- Do not weaken auth, founder allowlisting, RLS, audit logging, tests, types, release gates, documentation truth, or temporal truth to make a check green.
- Do not silently change provider ownership, project registry semantics, event schemas, approval states, deployment targets, or current founder intent.
- Do not treat model output as approval, authorization, repository truth, provider truth, or a permanent truth lease.
- Merge only under the conditions in `docs/FOUNDER_MERGE_AUTHORITY.md`; a merge must never silently authorize a separately gated action.
- For nontrivial code changes, run `npm run typecheck` and `npm test` before claiming readiness, or explicitly report why they could not be run.
- Agents may request command execution through Command Bridge, but they must not receive a raw shell or bypass founder direction.
- Repository edits from Control Room must go through GitHub Workspace or the Approval Engine patch route, and writes must land on mission branches unless a separate founder merge gate is satisfied.
- Preserve history. Supersede stale truth explicitly rather than deleting evidence simply because the current answer changed.

## Approval gates

Require explicit founder approval before:

- creating operational branches or sandboxes when the current authority policy requires it;
- force-pushing, production deploying, or rolling back;
- changing founder identity, auth, authorization, allowlists, sessions, or RLS;
- adding, rotating, deleting, or exposing credentials;
- changing repository providers, domains, DNS, production environments, or billing;
- destructive database or event-history changes;
- sending external communications or executing provider actions in the founder’s name unless a current, explicit, scoped standing contract authorizes that exact class.

Repository merges are governed by the standing founder decision in `docs/FOUNDER_MERGE_AUTHORITY.md` and may proceed without another merge-only prompt when its conditions are satisfied.

An audit authorizes inspection, not mutation.

## Required report

For material work, report:

1. Goal
2. Reality
3. ULTRATHINK system decomposition
4. Product Design state/user review
5. Data Analytics measurement/truth review
6. Risk I: premise
7. Lindy screen
8. L99 system view
9. OODA decision/action
10. Hormozi value pass
11. Bill Gates bottleneck and leverage pass
12. Elon Musk requirement, deletion, simplification, feedback, and automation pass
13. Risk II: chosen-plan Redteam
14. Proof
15. Documentation truth / truth age
16. Rollback
17. Next approval gate

The Control Room exists to preserve founder authority, not automate it out of existence because a workflow diagram became excited.
