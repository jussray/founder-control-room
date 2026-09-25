# Audit Receipt — Chat to FCR Productization

Date: 2026-09-25
Authoritative repository observed: `jussray/founder-control-room`
Observed base head: `ff93d13019343672127d9f5e18e8991b6bf34b1f`
Paired repository observed: `jussray/chief-ai-machine`
Observed Chief base head: `200c783a474adb2900587971f904e8aff8f8cdc5`
Goal: stop repeatable founder workflows from remaining trapped in chat and assign durable responsibilities to FCR, Chief, PromptOS, providers, Council, and Court.

## Scope inspected

- FCR `AGENTS.md`, `AGENTS_FOUNDER_INTELLIGENCE.md`, `GLOBAL_AI.md`
- FCR `CHATGPT.md`, `CLAUDE.md`, `PERPLEXITY.md`
- FCR `.ai/skills/juss-founder-os/SKILL.md`
- FCR `.control-room/COUNCIL.md`
- FCR StoryEngine three-council Court address
- FCR AI-skill verification surface
- Chief `AGENTS.md`, `CLAUDE.md`, `CHATGPT.md`, `PERPLEXITY.md`
- Chief `.claude/skills/juss-chief-ai/SKILL.md`
- Chief Council residency/Executive Council surfaces
- Chief/FCR pair verifier

## TRUE baseline

### VERIFIED

1. FCR already owns governance, evidence, approvals, guarded execution, receipts, and portfolio truth boundaries.
2. Chief already owns reasoning, synthesis, capability/model/agent/tool selection, and recommendation composition while FCR retains governance/execution authority.
3. PromptOS already has lane-specific North Stars, prompt lineage, execution receipts, outcome attribution, and reusable-prompt promotion semantics.
4. The Founder Council is already a backstage reasoning/review layer with dual residency in the founder assistant host and project Control Rooms.
5. Claude, ChatGPT/Codex, Perplexity, Muse, and other providers already have bounded capability roles and do not receive authority from model capability alone.
6. The StoryEngine Court is already defined as Writers Council + AI Council + Production Council with independent-first deliberation, `/DEVIL` cross-examination, creator ruling, and `tool capability != permission`.
7. Existing FCR verification already has a load-bearing `verify:ai-skills` path. Chief has a load-bearing Founder Control Room / Chief pair contract verifier.

### GAP

1. The repositories did not yet have one explicit load-bearing doctrine saying: **chat is the invention lab; proven repeatable work graduates into FCR**.
2. Repeated founder work could remain encoded as conversational behavior, manual slash-command stacks, or provider-specific habits instead of becoming user-runnable product capability.
3. The user-facing abstraction boundary was implicit, not explicit: ordinary FCR users should receive outcome workflows rather than founder-internal command stacks.
4. Chief's routing skill recognized repeated insight as a possible skill improvement, but did not yet define a full FCR `WorkflowCandidate` graduation packet.
5. Chief's Perplexity contract was materially thinner than the ChatGPT/Claude operating surfaces and did not carry the complete productization understanding.
6. Council and Court contracts protected authority well but did not explicitly state that repeated successful deliberation patterns should be packaged into FCR workflows rather than manually reconvened from chat forever.
7. Provider-key boundaries existed in multiple places, but the productization rule needed one canonical statement that OpenAI/Anthropic keys provide model intelligence, not unrelated service authority.

### SELF-AUDIT / CONFESS

The assistant-side failure pattern was architectural, not merely conversational: too many useful improvements were retained as behavior the founder had to keep invoking in chat. That creates founder repetition, continuity pressure, and launch drag. The correct graduation target is the founder-owned product, not permanent dependence on the current chat session.

Correction:

- use chat for invention, challenge, research, and new decisions;
- identify repeated operational burden;
- prove it;
- compile it into a reusable workflow contract;
- hand it to FCR for durable execution and user access;
- let Chief own routing/candidate compilation rather than durable authority;
- keep PromptOS focused on prompt/protocol lineage;
- keep Council/Court as deliberation layers; and
- preserve exact proof/authority gates.

## Fix introduced by this audit

Canonical contract: `docs/FOUNDER_WORK_PRODUCTIZATION_CONTRACT.md`

The contract defines:

- chat vs FCR responsibilities;
- no-chat-captivity invariant;
- user-facing workflow abstraction;
- FCR / Chief / PromptOS split;
- `WorkflowCandidate` packet;
- graduation criteria;
- provider/API-key boundary;
- ChatGPT, Claude, Perplexity, Muse/Council roles;
- Council productization rule;
- Court productization rule; and
- instruction inheritance for agent/provider/skill documentation.

## Task allocation

### FCR

Build the durable Workflow Library + Runner that consumes approved `WorkflowCandidate` packages and gives authorized users repeatable outcomes with permissions, proof, receipts, rollback, and tenant/project isolation.

First launch-oriented workflow candidates should prefer already-proven portfolio behavior rather than new abstractions, for example:

- `Repair my app`
- `Launch audit`
- `Decision challenge`

### Chief AI

Detect repeatable founder/user work, compare it with existing capabilities, and emit bounded FCR `WorkflowCandidate` handoffs containing public label, outcome, inputs, outputs, internal stack, model/Council route, tools, authority, proof, rollback, privacy, cost, success/failure signals, and repeatability evidence.

### PromptOS

Supply lane-specific prompt/protocol components and outcome lineage without becoming execution authority.

### Council

Improve decision quality, preserve dissent, and package repeated routing patterns into workflow definitions. Do not become an executor or user-facing agent zoo.

### Court

Remain the StoryEngine deliberation overlay. Repeated Court patterns may become FCR/StoryEngine workflows, but creator ruling remains mandatory.

### Providers

Remain replaceable intelligence/capability providers. Provider credentials do not become universal service credentials.

## Proof state

- Productization doctrine: `SOURCE IMPLEMENTED` on focused branches after this audit.
- FCR Workflow Library/Runner runtime: `NOT YET RUNTIME VERIFIED` by this docs/contract audit.
- Chief WorkflowCandidate detector/compiler runtime: `NOT YET RUNTIME VERIFIED` by this docs/contract audit.
- Existing Council/Court semantics: `VERIFIED IN SOURCE` at the observed base heads.

Do not claim the workflow product layer launched merely because this contract exists.

## Rollback

Revert the focused productization-contract commits/PRs. Do not erase this audit receipt or predecessor evidence; mark it historical/superseded if a successor doctrine replaces it.

## Next proof gate

1. make instruction inheritance load-bearing across the first-class provider/Council/Chief surfaces;
2. implement FCR Workflow Library + Runner as the smallest launch slice;
3. implement Chief WorkflowCandidate handoff compilation;
4. run exact-head tests and targeted Playwright when user-facing FCR workflow surfaces change;
5. prove one workflow can be run twice without reconstructing its internal command stack in chat.
