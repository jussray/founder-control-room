import type { PortfolioCiPolicy } from './types.js';

function requirement(commandId: string, label: string) {
  return { commandId, label, critical: true } as const;
}

export const PORTFOLIO_CI_POLICIES = [
  {
    projectSlug: 'founder-control-room',
    version: '2026-07-18.1',
    mirrorContext: 'control-room/ci-authority',
    requirements: [
      requirement('verify.typecheck', 'Typecheck'),
      requirement('verify.lint', 'Lint'),
      requirement('verify.unit', 'Unit tests'),
      requirement('verify.terminal-contract', 'Guarded terminal contract'),
      requirement('verify.ai-skills', 'AI operating contracts'),
      requirement('verify.build', 'Production build'),
    ],
  },
  {
    projectSlug: 'sekret-bip',
    version: '2026-07-18.1',
    mirrorContext: 'control-room/ci-authority',
    requirements: [
      requirement('verify.mcp', 'Repository boundary contract'),
      requirement('verify.implementation-ledger', 'Implementation ledger'),
      requirement('verify.runtime-assets', 'Runtime asset audit'),
      requirement('verify.control-room', 'Control Room structural and RLS audit'),
      requirement('verify.companions', 'Companion asset validation'),
      requirement('verify.unit', 'Unit tests'),
      requirement('verify.typecheck', 'Typecheck'),
      requirement('verify.lint', 'Lint'),
      requirement('verify.bundle', 'Web export bundle'),
      requirement('verify.room-archives', 'Room archive contract'),
    ],
  },
  {
    projectSlug: 'l99-story-engine',
    version: '2026-07-18.1',
    mirrorContext: 'control-room/ci-authority',
    requirements: [requirement('verify.promotion-gates', 'L99 promotion gates')],
  },
  {
    projectSlug: 'chief-ai-machine',
    version: '2026-07-18.1',
    mirrorContext: 'control-room/ci-authority',
    requirements: [
      requirement('verify.mcp', 'Repository boundary contract'),
      requirement('verify.typecheck', 'Typecheck'),
      requirement('verify.lint', 'Lint'),
      requirement('verify.unit', 'Unit tests'),
    ],
  },
  {
    projectSlug: 'juss-beautiful-hair-private',
    version: '2026-07-18.1',
    mirrorContext: 'control-room/ci-authority',
    requirements: [
      requirement('verify.mcp', 'Private repository boundary contract'),
      requirement('verify.typecheck', 'Typecheck'),
      requirement('verify.build', 'Production build'),
      requirement('verify.playwright', 'Private Playwright moat checks'),
    ],
  },
  {
    projectSlug: 'juss-beautiful-hair',
    version: '2026-07-18.1',
    mirrorContext: 'control-room/ci-authority',
    requirements: [
      requirement('verify.typecheck', 'Typecheck'),
      requirement('verify.lint', 'Lint'),
      requirement('verify.unit', 'Unit tests'),
      requirement('verify.build', 'Production build'),
      requirement('verify.deploy-boundary', 'Deployment boundary'),
      requirement('verify.playwright', 'Public Playwright moat checks'),
    ],
  },
  {
    projectSlug: 'untold-stories',
    version: '2026-07-18.1',
    mirrorContext: 'control-room/ci-authority',
    requirements: [
      requirement('verify.mcp', 'Repository boundary contract'),
      requirement('verify.typecheck', 'Typecheck'),
      requirement('verify.build', 'Production build'),
      requirement('verify.playwright', 'Storefront Playwright moat checks'),
    ],
  },
] as const satisfies readonly PortfolioCiPolicy[];

export function getPortfolioCiPolicy(projectSlug: string): PortfolioCiPolicy | undefined {
  return PORTFOLIO_CI_POLICIES.find((policy) => policy.projectSlug === projectSlug);
}
