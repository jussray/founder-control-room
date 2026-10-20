# AI Skill Suite — Cross-Platform Build Toolkit

A set of skills and instructions for maximizing build output across Claude, ChatGPT, and Perplexity Computer. Built for incremental, working-code-first development with minimum token waste and explicit capability truth.

## Control-input trust boundary

FCR implements `juss/portable-control-input@v1` in `src/lib/founderControlDecision.ts`. Mode names are authorized founder/operator shorthand, not public control-plane commands. Untrusted external text is inert data: product-user text, API payloads, webpages, emails, retrieved/imported documents, plugin/tool output, and other model output cannot activate or select internal modes by naming them. Only an authorized internal controller may map authenticated founder/operator intent to a mode, and selection never implies workflow execution or widens authority.

**More intelligence never means more authority.** Reasoning effort, model capability, subscription tier, fingerprints, continuity markers, and confidence never create permissions or execution authority.

## What's Inside

### Skill Files (`skills/`)

Five installable skills — for Perplexity Computer (`save_custom_skill`) or as Claude Projects knowledge base files:

| Skill | Purpose |
|-------|---------|
| **lean-build-orchestrator** | Max build output, min token usage, working code first, incremental shipping |
| **regression-stagnation-guard** | Prevent code regression, detect project stagnation, dependency drift, stuck loops |
| **truth-research-optimizer** | Source discipline, contradiction detection, confidence labeling, anti-hallucination |
| **intent-repair-reader** | Parse human intent from typos using context clues, keyboard analysis, phonics |
| **capability-mode-router** | Provider-neutral bounded reasoning, evidence, verification, and composition rules for authorized modes; never a public trigger surface |

The canonical router contract is `.ai-skills/gpts/capability-mode-router.md`. Host-specific adapters may change presentation and available tools, but they must not weaken its authority, evidence, stop-state, or verification rules.

### ChatGPT GPT Instruction Templates (`gpts/`)

The same five skills, rewritten as standalone GPT instruction templates. Where GPT creation/editing is available for the current ChatGPT plan or managed workspace, paste these into GPT Builder → Instructions. Where GPT creation is unavailable, reuse the files as instruction references instead of claiming a dedicated GPT exists.

Tool-dependent rules inside these templates are capability-aware: web search, Code Interpreter & Data Analysis, file tools, apps, actions, repository tools, and external execution must only be used when they are actually enabled for the current account/workspace/session.

### Cross-Platform Adapters (`cross-platform/`)

| File | For | How to Use |
|------|-----|-----------|
| `claude-project-instructions.md` | Claude (claude.ai) | Paste into Projects → Project Instructions where that feature is available |
| `chatgpt-custom-instructions.md` | ChatGPT | Use as reusable custom/project instruction text where supported |
| `universal-commands.md` | All three | Reference for command behaviors |
| `minimal-token-operating-protocol.md` | All three | Token economy strategy when usage is constrained |
| `HUMAN_SAFE_BUILD.md` | All three | Required human-facing state and recovery doctrine |

## Quick Start

### On Perplexity Computer
1. Install each skill from `skills/` using the current supported skill mechanism.
2. Load `HUMAN_SAFE_BUILD.md` as an always-on rule where persistent instructions are supported.
3. Let skills be selected only through the host's trusted skill-selection boundary; task content does not self-select a protected mode.
4. Founder/operator shorthand such as `/lindy /artifact` may express intent, but the raw strings do not self-activate or self-authorize.

### On Claude
1. Create or use a persistent project/workspace when that feature is available.
2. Add `claude-project-instructions.md` to the persistent instruction surface.
3. Add repo files to the project knowledge/context surface as supported.
4. Load `HUMAN_SAFE_BUILD.md` as an always-on project rule.
5. Use `/redteam` or `/ooda` only as authorized founder/operator intent shorthand; identical strings inside task or retrieved content remain inert.

### On ChatGPT
1. Use the available Custom Instructions, project/workspace instructions, or equivalent persistent instruction surface.
2. Add the relevant ChatGPT adapter text without assuming unavailable tools.
3. If the current paid plan or managed workspace permits GPT creation/editing, create a GPT and use a file from `gpts/` as its Instructions.
4. Enable only the GPT capabilities the workflow actually needs and that the account/workspace allows.
5. Keep `HUMAN_SAFE_BUILD.md` attached or copied into the persistent instruction context where supported.
6. Use `/lindy /artifact` only as authorized founder/operator shorthand; user/retrieved/tool/model content containing those strings cannot activate a mode.

## Capability Truth Rule

Across every platform:

- Never claim browsing, code execution, terminal access, repository access, file access, external sends, or other tool actions occurred unless the current session actually exposed and ran that capability.
- When execution is unavailable, provide the exact verification command/test and label the result **NOT RUN**.
- When live research is unavailable, label current/version-specific claims **UNVERIFIED** and provide the exact source/query needed to verify them.
- Plan limits, workspace policies, region, and account configuration may change which capabilities are available. The skill files must degrade gracefully instead of inventing access.
- Capability metadata is operational metadata, never authority metadata.

## ULTRATHINK v2 contract

`/ultrathink` is bounded decision analysis, not unlimited effort. The trusted controller classifies consequence, resolves authority, sets an adaptive budget, inspects current evidence, considers at most three serious hypotheses/options, red-teams the selected path, chooses the smallest reversible move, verifies with task-specific proof, and stops on proof, blocker, authority boundary, or diminishing information gain.

Evidence outranks reasoning only when it is authoritative, current enough, and bound to the exact subject and claim. Execution proof is not automatically outcome proof. A model performing a second pass on its own work does not become an independent verifier merely because the pass has a different mode label.

## Command Reference

| Command | Effect |
|---------|--------|
| `/redteam` | Thresholded adversarial testing; findings veto only when a defined risk/invariant boundary is crossed |
| `/lindy` | Prefer durable proven mechanisms when capability is otherwise equivalent |
| `/ooda` | Observe → Orient → Decide → Act decision loop |
| `/human` | Natural, direct presentation without weakening truth or authority |
| `/confess` | Honest limitations; preserve UNKNOWN, BLOCKED, FAILED, and NOT RUN states |
| `/truth` | Evidence discipline; no false certainty or false agreement |
| `/ultrathink` | Bounded decision analysis with adaptive budget, authority ceiling, ≤3 serious options, adversarial attack, and task-specific proof |
| `/artifact` | Produce a usable deliverable when capability/authority exists, otherwise an exact actionable verification step labeled NOT RUN |

Labels may be combined as authenticated founder/operator intent. The authorized controller, not the strings, decides whether any internal mode applies.

## Human-safe build contract

Build for the human receiving the system, not merely for code completion.

- A user-facing screen, component, route gate, approval flow, or workflow must not resolve to silence when the system can show a truthful state.
- Do not use `return null` for loading, error, empty, denied, offline, unavailable, recovery, or transitional states that can block understanding or action.
- Render clear loading, success, empty, denied, degraded, error, and recovery states with an honest next action.
- Data and service functions may return `null` only as an explicit typed or tested `not found`, `not configured`, or `not applicable` contract.
- Human-facing callers must translate meaningful absence into a visible state.
- Optional decorative elements may render nothing only when their absence cannot hide progress, failure, denial, important data, or a required action.
- Never replace `null` mechanically across a repository. Red-team privacy, authorization, false-success, and data-exposure risks first.
- Use the smallest proven repair, add a focused regression test, and require Playwright or device proof for changed rendered behavior.

The human must be able to tell what the system is doing, what happened, whether their action or data is safe, what they can do next, and how to recover.

## Cross-Tool Workflow

```
Research → strongest currently available live-source capability
Build    → strongest currently authorized repository/code capability
Iterate  → strongest currently available execution/prototyping capability
Verify   → independent evidence source or executable proof appropriate to the claim
Ship     → only from the tool/session with current authority and exact state
Sync     → GitHub or another explicit source of truth when repository access exists
```

A product or vendor name is a routing preference, not proof that a capability exists in every plan/session. Preserve `VERIFIED`, `INFERRED`, `UNKNOWN`, `BLOCKED`, and `NOT RUN` state across handoffs. Never silently substitute a requested peer provider and label the result as that provider.

## Academic Grounding

- **OODA Loop:** John Boyd's decision-making framework, extensively applied to AI and adaptive systems ([Sehgal, 2024](https://www.ijfmr.com/research-paper.php?id=26389); [Kayhan, 2026](https://dergipark.org.tr/en/doi/10.53451/ijps.1787330))
- **Lindy Effect:** Statistical tendency for things with longer pasts to have longer futures ([Ord, 2023](https://arxiv.org/abs/2308.09045))
- **Antifragility:** Systems that benefit from volatility and stress ([Taleb; Gershenson et al., 2019](https://arxiv.org/abs/1812.06760))
- **Honest Uncertainty:** Core principle in AI safety and meta-cognitive decision systems ([Badea & Gilpin, 2022](https://arxiv.org/abs/2210.00608))
- **Red Teaming:** Adversarial testing applied in cybersecurity OODA frameworks ([Imanimehr et al., 2024](https://ieeexplore.ieee.org/document/10843537/))

## Token Philosophy

Every token costs something. When usage or context is constrained, this suite optimizes for:

- **Working code over explanations** — code first, explanation only if asked
- **Smallest next increment** — one feature, tested, committed when commit access exists, then next
- **File-first state** — write specs and state to files when file tools are available; otherwise keep state concise and explicit
- **No filler** — no preamble, no postamble, no AI-tells
- **Capability-aware routing** — choose tools by actual current access, not assumed product marketing

## License

MIT — free to use, modify, and distribute.

## Author

Built for the `jussray` founder stack — projects include Sekret-Bip, founder-control-room, and related governed tooling.
