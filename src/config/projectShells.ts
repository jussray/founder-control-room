import { PORTFOLIO_PROJECTS } from './portfolio.js';

export const CONTAINER_FAMILIES = ['intent', 'work', 'authority', 'truth', 'lifecycle'] as const;
export type ContainerFamily = (typeof CONTAINER_FAMILIES)[number];

export interface ProjectShellDefinition {
  projectSlug: string;
  shellName: string;
  identity: string;
  primaryOutcome: string;
  emphasis: readonly ContainerFamily[];
  projectSpecificViews: readonly string[];
  inheritedFcrContracts: readonly string[];
}

const inheritedFcrContracts = [
  'founder-intent',
  'authority',
  'evidence',
  'multi-reality-truth',
  'outcome',
  'recovery',
  'continuity',
  'next-gate',
  'growth-opportunity-intelligence',
] as const;

export const PROJECT_SHELLS: readonly ProjectShellDefinition[] = [
  {
    projectSlug: 'sekret-bip',
    shellName: "Se’kret Bip Project Shell",
    identity: 'teen/family emotional-wellness product with isolated privacy and safety boundaries',
    primaryOutcome: 'move the product toward safe, verified use without collapsing its customer boundary into FCR',
    emphasis: ['intent', 'truth', 'authority', 'lifecycle'],
    projectSpecificViews: ['product-state', 'safety', 'mobile-runtime', 'supabase', 'cloudflare', 'firebase', 'playwright-proof'],
    inheritedFcrContracts,
  },
  {
    projectSlug: 'juss-beautiful-hair',
    shellName: 'Juss Beautiful Hair Storefront Shell',
    identity: 'customer-facing commerce storefront',
    primaryOutcome: 'move shoppers from discovery to verified checkout and purchase outcomes',
    emphasis: ['work', 'truth', 'lifecycle', 'intent'],
    projectSpecificViews: ['catalog', 'storefront-runtime', 'checkout', 'shopify', 'deployment', 'revenue-proof', 'playwright-proof'],
    inheritedFcrContracts,
  },
  {
    projectSlug: 'juss-beautiful-hair-private',
    shellName: 'Juss Beautiful Hair Operations Shell',
    identity: 'private commerce operations boundary',
    primaryOutcome: 'operate commerce administration without leaking private operational authority into the public storefront shell',
    emphasis: ['authority', 'truth', 'lifecycle', 'work'],
    projectSpecificViews: ['private-operations', 'inventory', 'orders', 'connections', 'resources', 'recovery'],
    inheritedFcrContracts,
  },
  {
    projectSlug: 'l99',
    shellName: 'StoryEngine Capability Shell',
    identity: 'story and artifact generation capability represented through FCR without erasing its product boundary',
    primaryOutcome: 'turn founder intent into governed, provenance-bearing content and artifacts',
    emphasis: ['intent', 'work', 'truth'],
    projectSpecificViews: ['story-brief', 'artifact-generation', 'provenance', 'review', 'distribution-handoff', 'outcome'],
    inheritedFcrContracts,
  },
  {
    projectSlug: 'chief-ai-machine',
    shellName: 'Chief Intelligence Peer Shell',
    identity: 'FCR integration shell for the standalone Chief executive synthesis and reasoning intelligence peer',
    primaryOutcome: 'let FCR exchange governed intent, evidence, recommendations, and receipts with Chief while both systems remain independently operable',
    emphasis: ['intent', 'authority', 'truth'],
    projectSpecificViews: ['reasoning', 'recommendations', 'provider-routing', 'constraints', 'evidence-needed', 'next-gate'],
    inheritedFcrContracts,
  },
  {
    projectSlug: 'untold-stories',
    shellName: 'Untold Stories Commerce Shell',
    identity: 'story-led commerce storefront',
    primaryOutcome: 'connect story provenance and storefront behavior to verified commerce outcomes',
    emphasis: ['work', 'truth', 'lifecycle', 'intent'],
    projectSpecificViews: ['stories', 'catalog', 'shopify', 'checkout', 'provenance', 'revenue-proof', 'playwright-proof'],
    inheritedFcrContracts,
  },
  {
    projectSlug: 'sync-party',
    shellName: 'SYNC Party Game Shell',
    identity: 'multiplayer game product with a governed project-local Control Room and continuity boundary',
    primaryOutcome: 'advance the real multiplayer experience while preserving runtime identity, browser proof, and project-local authority',
    emphasis: ['work', 'truth', 'lifecycle', 'authority'],
    projectSpecificViews: ['game-runtime', 'multiplayer', 'sessions', 'control-room', 'continuity', 'playwright-proof'],
    inheritedFcrContracts,
  },
  {
    projectSlug: 'founder-control-room',
    shellName: 'Founder Control Room Operating Environment',
    identity: 'standalone founder operating and build intelligence, portfolio control plane, and first-party commerce business',
    primaryOutcome: 'let the founder reason, build, inspect, operate, verify, recover, and advance the portfolio with or without external AI providers while preserving governed execution, verified outcomes, revenue, and one exact next gate',
    emphasis: ['intent', 'work', 'authority', 'truth', 'lifecycle'],
    projectSpecificViews: [
      'portfolio',
      'missions',
      'capabilities',
      'approvals',
      'connections',
      'truth',
      'outcomes',
      'resources',
      'decisions',
      'recovery',
      'catalog',
      'storefront-runtime',
      'shopify',
      'checkout',
      'revenue-proof',
      'playwright-proof',
    ],
    inheritedFcrContracts,
  },
  {
    projectSlug: 'promptos',
    shellName: 'PromptOS Intelligence Peer Shell',
    identity: 'FCR integration shell for the standalone PromptOS prompt, workflow, compiler, routing, and evaluation intelligence peer',
    primaryOutcome: 'let FCR exchange governed workflow and protocol intelligence with PromptOS while both systems remain independently operable',
    emphasis: ['authority', 'intent', 'truth'],
    projectSpecificViews: ['prompt-registry', 'skills', 'policy', 'ooda', 'redteam', 'l99', 'lindymode', 'behavior-proof'],
    inheritedFcrContracts,
  },
] as const;

export function getProjectShell(projectSlug: string): ProjectShellDefinition | undefined {
  return PROJECT_SHELLS.find((shell) => shell.projectSlug === projectSlug);
}

export function assertProjectShellCoverage(): void {
  const activeSlugs = new Set(PORTFOLIO_PROJECTS.map((project) => project.slug));
  const shellSlugs = new Set(PROJECT_SHELLS.map((shell) => shell.projectSlug));

  const missing = [...activeSlugs].filter((slug) => !shellSlugs.has(slug));
  const unknown = [...shellSlugs].filter((slug) => !activeSlugs.has(slug));

  if (missing.length || unknown.length) {
    throw new Error(`project_shell_coverage_mismatch missing=${missing.join(',')} unknown=${unknown.join(',')}`);
  }
}
