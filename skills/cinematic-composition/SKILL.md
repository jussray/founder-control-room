---
name: cinematic-composition
version: 1.0.0
status: proposed
scope: portfolio-design-and-agent-handoff
owner: founder
---

# One Cohesive Cinematic Composition — Founder Design Contract

## Intent

Every Juss & Co. app, website, page, screen, and state must feel like an intentional scene within one cohesive cinematic product experience. This is a **composition and quality rule**, not permission to make all products look alike. Preserve each project's distinct characters, color system, audience, voice, and verified product facts.

Apply to new work immediately in the authorized task scope; improve existing screens only after inspecting their real source and current rendered behavior. Do not treat this document as a production deployment, global agent installation, release approval, or proof that every site already complies.

## Mandatory directions for design and coding agents

1. **One composition, not disconnected blocks.** Define a dominant scene, focal subject or product purpose, visual hierarchy, negative space, and one primary action. Navigation, supporting sections, and footer belong to the same art direction.
2. **Scene continuity.** Use a consistent visual language for depth, light, texture, type, iconography, radius, borders, shadows, imagery, copy, and transitions through a page and its neighboring routes. A page may shift tone deliberately, but must not reset styling accidentally.
3. **Product-specific identity.** Reuse each product's existing canonical design tokens, licensed assets, characters, and accessible UI patterns. FCR is not Bip; Truth Compass is not the hair storefront. Unify *composition quality*, not brand palettes or illustration subjects.
4. **Three intentional depth layers when appropriate.** Environment/background, story/information, and foreground/action should support clarity. Never make decorative depth block reading or interaction. On constrained devices, simplify rather than crop important controls.
5. **Complete states and journeys.** Include home, navigation, onboarding, sign-in/up, account, dashboards, settings, commerce, legal/trust pages, loading, empty, error, permission-denied, success, and mobile states wherever the product actually exposes them. Do not invent pages that do not exist.
6. **Functional and inclusive cinematic design.** Maintain keyboard support, semantic structure, appropriate contrast, visible focus, readable type, reduced-motion alternatives, touch targets, screen-reader meaning, fast loading, and progressive enhancement. Avoid forced parallax, autoplay, flashing, or motion-dependent instructions.
7. **Truthful imagery and claims.** Visual reconstruction, generated footage, diagrams, or mock data cannot masquerade as live product proof. Do not expose credentials or private customer, teen, parent, or founder data. Respect consent and licensed assets.
8. **Performance and resilience.** Optimize media, reserve layout space, avoid cumulative layout shift, provide alt text or decorative exclusion, and include fallback states. Lighting effects must not interfere with devices, accessibility, or core flows.
9. **No unrelated redesign.** Inspect the current app and existing design system first. Modify the smallest coherent set of components/tokens/routes necessary to achieve the requested outcome. Preserve working auth, payments, analytics, privacy, and business logic.
10. **Evidence before completion.** Validate all changed routes and responsive breakpoints with actual rendered captures and interaction tests on the exact candidate head. Distinguish source authored, tests run, visual QA, deployed, and end-user outcome. Do not call a documentation-only adoption a shipped redesign.

## Agent handoff contract

For each authorized task, provide:

- `product`, `repository`, `branch`, `exact_head`, `route_or_screen`, and `target_user_task`;
- source design system and brand invariants;
- the scene thesis (purpose, focal hierarchy, atmosphere, primary CTA);
- exact coupled routes/states and token/component reuse;
- implementation files with reversible scope;
- accessibility, mobile, reduced-motion, and performance evidence;
- actual screenshot and browser/test provenance, plus remaining gaps;
- approval, merge, and deployment statuses **separate from implementation**.

If canonical token definitions or design reference are unknown, label the gap UNKNOWN. Do not silently replace existing brand identity with a generic black-and-gold or neon template.

## Acceptance gate

A changed experience passes cinematic composition QA only if:

- the page reads as one cohesive scene from hero through footer, without unintentional component-style discontinuities;
- all linked pages/states in the tested flow share the same product art direction;
- all interactions and important content remain usable on mobile and desktop;
- reduced-motion and keyboard navigation remain usable;
- real visual evidence and focused behavior checks exist for the changed head;
- all claims, permissions, security, and privacy behaviors remain truthful and independently gated.

A design gate is not a merge, publication, privacy, payments, runtime, or revenue gate. Follow `skills/product-design-gate/SKILL.md` and each repository's stronger founder authority rules.

## Integration rule

Coding agents should read this skill from the canonical Founder Control Room source at `skills/cinematic-composition/SKILL.md` only after its target ref is reviewed and authorized. Mirror a short pointer in local `AGENTS.md` / agent entrypoints on their own governed branches. The pointer does **not** automatically load content into another model, plugin, deployed app, or repository.
