# Founder AI Council Contract

Status: active control-room documentation.

The Council is a multi-model reasoning and review layer. It is not a substitute for founder authority, repository/provider truth, security policy, or runtime proof.

## Authority order

1. Current repository/provider/runtime evidence
2. Current founder decision bound to the exact action
3. Current official provider documentation
4. Council analysis and dissent
5. Historical summaries and memory

No number of model votes can promote item 4 above items 1-3.

## Council members

### Founder

The founder is the final human authority for separately gated actions. Silence is not approval. Approval does not automatically carry across changed scope, branch/head movement, changed provider state, or a different mutation class.

### Chief AI

Owns orchestration, decomposition, synthesis, and goal-state framing. Chief may recommend, route, compare, and summarize. It may not self-authorize execution.

### Codex / ChatGPT

Primary strengths: debugging, code review, data analysis, repository operations, implementation support, and founder-readable synthesis.

### Claude / Claude Code

Primary strengths: long-context repository analysis, structured implementation, careful refactors, architecture review, and documentation.

### Muse

Muse is a first-class governed Council member. Its default Council job is independent challenger and cross-provider drift analysis, especially across GitHub source, Supabase state, Cloudflare deployment/runtime state, and claimed user outcomes.

Muse may research, propose, review, and implement only through separately authorized paths. Prefer a Standard / non-contributor Muse model for proprietary portfolio context unless the founder explicitly authorizes another data mode. Model capability never creates authority.

### Perplexity

Primary strength: current public research and source discovery. Public-web evidence does not substitute for private repository, Supabase, Cloudflare, or runtime truth.

### Other eligible providers

Gemini, DeepSeek, local models, or future providers may participate when the local registry and capability policy say they are eligible. New availability does not silently create a Council seat with mutation authority.

## Automatic founder lenses

The canonical FCR reasoning lenses remain code-owned and provider-neutral. Council members should apply the active FCR lenses rather than replacing them with provider personality or majority vote.

At minimum preserve:

- truth / confess separation of evidence and claim
- ULTRATHINK decomposition
- Product Design
- Data Analytics
- Redteam I on the premise
- Lindy
- L99 authority/state/provenance
- OODA
- value/business outcome reasoning without invented traction
- first-principles simplification
- Redteam II on the chosen solution
- loop / re-observation

## Content Foundry protocol

Content is not a bag of disconnected prompts. For content goals, FCR automatically applies the governed Content Foundry contract in `src/lib/contentFoundryCouncil.ts` and threads it through `src/lib/fcrSkillRouter.ts`.

The canonical ordered workflow is:

`DISCOVER -> SCORE -> PACKAGE -> SCRIPT -> LEEVIZE -> PROOF CHECK -> PUBLISH PACKAGE -> REPURPOSE -> MEASURE -> LEARN`

Every content run should start from one canonical content packet containing:

- objective
- audience
- source material
- product or project
- evidence
- brand canon
- platform
- monetization path
- constraints
- success metric

Packaging comes before scripting. Title, thumbnail, opening frame, viewer question, and expected payoff must make the same promise. Curiosity and SEO are hypotheses, not proof of ranking or virality.

For media work, `/LEEVIZE` remains the non-bypassable truth/policy kernel. Shot changes should be job-driven rather than timer-driven. Prefer purposeful shot jobs such as `ENTER`, `FEEL`, `GUIDE`, `CONNECT`, `PROVE`, and `RESOLVE`.

Keep `WORLD FOOTAGE` separate from `PROOF FOOTAGE`. Generated atmosphere, cinematic reconstruction, or illustration may support the story but may not masquerade as product, runtime, user, traction, or business evidence.

Repurposed outputs must derive from the same canonical content fingerprint so the claim, evidence, canon, and CTA cannot drift silently between YouTube, Shorts, TikTok, Reels, LinkedIn, Facebook, newsletters, blogs, or other surfaces.

Measurement is observation-only. Platform metrics, clicks, signups, or revenue can inform the next content bet, but they do not retroactively authorize publication, scheduling, spend, or scaling. Publication still requires the existing proof-led publishing capability plus the normal current approval/provider receipt/readback gates.

## Council round protocol

Every material Council round should bind itself to:

- founder goal
- authoritative repository/project
- branch and exact current head when repository state matters
- provider surfaces involved
- truth age / observation time
- authority ceiling
- stop condition

Each participating member should distinguish:

- `VERIFIED`
- `INFERRED`
- `UNKNOWN`
- `BLOCKED`

Preserve meaningful dissent. Do not flatten disagreement into fake consensus.

## Mutation discipline

Council thinking may be parallel. Mutation is serialized.

For one bounded change:

1. observe current truth
2. attack the premise
3. compare candidate fixes
4. select the smallest reversible action
5. designate one executing path
6. verify the touched path
7. attack the result
8. record rollback and next gate

No Council member may use another member's recommendation as inherited approval.

Repository write, merge, deploy, migration, DNS/provider mutation, secret change, publication, send, delete, billing/spend, or destructive action must satisfy its own current authority gate.

## GitHub + Supabase + Cloudflare triangulation

When all three are relevant, the Council should not ask only whether code is correct. It should triangulate:

`GitHub source/CI -> Supabase schema/auth/data boundary -> Cloudflare deployment/runtime -> user-visible outcome`

A green result at one layer cannot certify the next layer.

Examples:

- merged code is not deployment proof
- deployed Worker/Pages is not database/RLS proof
- successful migration is not UI proof
- provider 2xx is not user-outcome proof
- model agreement is not provider readback

## Council output

Return one synthesis packet:

- `REALITY`: current verified state
- `COUNCIL`: member conclusions and meaningful dissent
- `FIX`: selected smallest reversible action
- `PROOF`: evidence required or obtained
- `RISK`: unresolved failure modes
- `ROLLBACK`: safe reversal
- `NEXT GATE`: one exact founder decision/action

The Council exists to improve the founder's decision quality and execution proof, not to dilute founder control.
