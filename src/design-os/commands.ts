export const DESIGN_COMMAND_DECK_CONTRACT = "juss/design-command-deck@v1" as const;
export const DESIGN_COMMAND_SHARED_CAPABILITY = "control-room-design-implementation" as const;

export type DesignCommandPhase =
  | "understand"
  | "structure"
  | "expression"
  | "interaction"
  | "resilience"
  | "finish";

export type DesignCommandMode = "observe" | "mutate" | "verify";

export interface DesignCommandSpec {
  id: string;
  slash: `/${string}`;
  label: string;
  phase: DesignCommandPhase;
  mode: DesignCommandMode;
  purpose: string;
  owns: string;
  forbids: string;
  requiresFounderApproval: boolean;
  requiresPlaywright: boolean;
}

function command(
  id: string,
  label: string,
  phase: DesignCommandPhase,
  mode: DesignCommandMode,
  purpose: string,
  owns: string,
  forbids: string,
): DesignCommandSpec {
  return {
    id,
    slash: `/${id}`,
    label,
    phase,
    mode,
    purpose,
    owns,
    forbids,
    requiresFounderApproval: mode === "mutate",
    requiresPlaywright: id !== "intent",
  };
}

/**
 * The 23 design commands are bounded operations of one shared design skill.
 * They are not 23 independent skills and they never create authority.
 *
 * A command may change only the design dimension it owns unless another
 * command is explicitly invoked. Mutating commands require founder approval.
 * UI/runtime completion claims require rendered Playwright evidence.
 */
export const DESIGN_COMMANDS = [
  command(
    "intent",
    "Intent",
    "understand",
    "observe",
    "Define the screen's user, job, desired outcome, consequence level, and stop condition before visual work begins.",
    "user outcome, task intent, consequence classification, and success condition",
    "visual mutation, implementation claims, or invented product behavior",
  ),
  command(
    "critique",
    "Critique",
    "understand",
    "observe",
    "Review the current rendered experience against its stated intent and produce prioritized evidence-backed findings.",
    "design diagnosis, severity, evidence, and smallest valid repair chain",
    "code mutation, aesthetic preference presented as fact, or unsupported causal claims",
  ),
  command(
    "hierarchy",
    "Hierarchy",
    "structure",
    "mutate",
    "Repair what users perceive first, second, and third so visual priority matches product priority.",
    "attention order, emphasis, grouping priority, and primary/secondary action weight",
    "copy rewrites, page architecture changes, or unrelated styling",
  ),
  command(
    "flow",
    "Flow",
    "structure",
    "mutate",
    "Repair the ordered path from entry through decision, action, result, and recovery.",
    "task sequence, step transitions, branching, and completion path",
    "brand restyling, decorative polish, or unrelated data-model changes",
  ),
  command(
    "information",
    "Information",
    "structure",
    "mutate",
    "Clarify information architecture, grouping, labels, sections, and navigation relationships.",
    "information grouping, navigation relationships, section structure, and discoverability",
    "visual-only restyling, invented data, or implementation beyond the approved information change",
  ),
  command(
    "copy",
    "Copy",
    "expression",
    "mutate",
    "Improve interface language for headings, buttons, helper text, errors, empty states, and instructions.",
    "interface wording, clarity, labels, microcopy, and truthful calls to action",
    "changing product behavior, claims not supported by evidence, or typography/layout changes",
  ),
  command(
    "typeset",
    "Typeset",
    "expression",
    "mutate",
    "Repair typography hierarchy, scale, weight, line height, measure, wrapping, and legibility.",
    "typographic system, text rhythm, legibility, and wrapping behavior",
    "copy rewrites, layout restructuring, or brand replacement",
  ),
  command(
    "layout",
    "Layout",
    "expression",
    "mutate",
    "Repair grid, containers, alignment, placement, composition, and spatial relationships.",
    "structural placement, grid, alignment, containers, and composition",
    "copy changes, product logic changes, or unrelated component restyling",
  ),
  command(
    "spacing",
    "Spacing",
    "expression",
    "mutate",
    "Normalize padding, margins, gaps, density, whitespace, and vertical rhythm without restructuring the page.",
    "spacing tokens, local gaps, padding, margins, density, and rhythm",
    "page architecture changes, typography changes, or content rewrites",
  ),
  command(
    "color",
    "Color",
    "expression",
    "mutate",
    "Repair palette application, contrast, semantic color roles, emphasis, and surface relationships.",
    "color tokens, semantic state color, contrast, surfaces, and emphasis",
    "brand replacement, content changes, or color-only work that weakens accessibility",
  ),
  command(
    "components",
    "Components",
    "expression",
    "mutate",
    "Normalize repeated interface elements into coherent reusable buttons, cards, navigation, dialogs, and controls.",
    "component consistency, reuse, variants, and repeated interaction primitives",
    "new product behavior, broad refactors unrelated to the visible inconsistency, or silent API changes",
  ),
  command(
    "states",
    "States",
    "interaction",
    "mutate",
    "Design and repair meaningful component states including default, focus, active, selected, loading, disabled, success, warning, and error.",
    "component state model, state visibility, focus/active feedback, and status semantics",
    "backend state invention, hidden errors, or decorative state changes without truthful data",
  ),
  command(
    "forms",
    "Forms",
    "interaction",
    "mutate",
    "Reduce completion friction through field order, labels, defaults, validation, errors, and submission confidence.",
    "form structure, field UX, validation presentation, labels, defaults, and submission feedback",
    "schema or permission changes without their own approval, fabricated validation, or unrelated layout work",
  ),
  command(
    "responsive",
    "Responsive",
    "interaction",
    "mutate",
    "Make the experience intentionally adapt across viewport classes rather than merely shrink the desktop layout.",
    "breakpoint behavior, reflow, responsive prioritization, and viewport-specific composition",
    "product logic changes, separate mobile product forks, or hiding required information to make a layout fit",
  ),
  command(
    "touch",
    "Touch",
    "interaction",
    "mutate",
    "Repair mobile interaction ergonomics including targets, reach, gestures, keyboards, sticky controls, and accidental activation risk.",
    "touch targets, mobile ergonomics, gesture affordances, keyboard interactions, and reachability",
    "desktop-only redesign, risky hidden gestures, or reduced accessibility for visual compactness",
  ),
  command(
    "accessibility",
    "Accessibility",
    "interaction",
    "mutate",
    "Repair semantic structure, keyboard behavior, focus, labels, contrast, motion alternatives, and assistive-technology compatibility.",
    "semantic accessibility, keyboard/focus behavior, assistive labels, contrast, and reduced-motion support",
    "removing functionality, weakening authority boundaries, or treating automated checks as complete human proof",
  ),
  command(
    "motion",
    "Motion",
    "interaction",
    "mutate",
    "Govern animation and transitions for continuity, feedback, timing, reduced motion, and removal of ornamental noise.",
    "animation purpose, timing, transition continuity, feedback motion, and reduced-motion behavior",
    "animation that hides latency/errors, blocks task completion, or substitutes spectacle for hierarchy",
  ),
  command(
    "feedback",
    "Feedback",
    "interaction",
    "mutate",
    "Make the system clearly communicate what happened, what is happening, what failed, and what the user can do next.",
    "status feedback, progress, confirmation, error explanation, and next-action clarity",
    "invented success, hidden failures, or backend outcome claims without evidence",
  ),
  command(
    "empty",
    "Empty",
    "resilience",
    "mutate",
    "Design useful zero-data, first-use, offline, missing-content, and not-yet-configured states.",
    "empty/zero states, first-use guidance, offline/missing states, and next-step affordances",
    "fake content, fake activity, or implying unavailable capabilities exist",
  ),
  command(
    "recovery",
    "Recovery",
    "resilience",
    "mutate",
    "Repair cancellation, undo, retry, destructive-action confirmation, error recovery, and safe escape routes.",
    "recovery paths, undo/retry, destructive confirmation, cancellation, and safe exits",
    "bypassing authority checks, silent destructive defaults, or rollback claims without a real rollback path",
  ),
  command(
    "brand",
    "Brand",
    "finish",
    "mutate",
    "Reconcile the interface with the product's native visual grammar without flattening every project into one aesthetic.",
    "product-native visual grammar, metaphor, tone, material, signature details, and brand coherence",
    "copying another project's aesthetic, weakening usability, or changing truth/authority semantics for style",
  ),
  command(
    "polish",
    "Polish",
    "finish",
    "mutate",
    "Apply the final precision pass after structural issues are resolved: optical alignment, borders, radii, icons, consistency, and visual noise.",
    "finish quality, optical alignment, border/radius discipline, icon treatment, and residual visual inconsistency",
    "concealing structural problems, changing product behavior, or replacing unresolved critique findings with cosmetics",
  ),
  command(
    "prove",
    "Prove",
    "finish",
    "verify",
    "Verify the approved result on the real rendered path and close the loop with exact-head evidence and continuity receipts.",
    "Playwright proof, viewport/state coverage, exact-head binding, evidence classification, and design receipt",
    "new design mutation, authority expansion, green claims without evidence, or treating fingerprints/cookies as authorization",
  ),
] as const satisfies readonly DesignCommandSpec[];

export type DesignCommandId = (typeof DESIGN_COMMANDS)[number]["id"];

export function getDesignCommand(id: string): DesignCommandSpec | undefined {
  const normalized = id.trim().replace(/^\//, "").toLocaleLowerCase("en-US");
  return DESIGN_COMMANDS.find((entry) => entry.id === normalized);
}
