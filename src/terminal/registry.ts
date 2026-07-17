import type { TerminalCommandSpec } from './types.js';

const VERIFY_TIMEOUT = 10 * 60_000;
const INSTALL_TIMEOUT = 15 * 60_000;
const OUTPUT_CAP = 512 * 1024;
const PLAYWRIGHT_VERSION = '1.61.1';

function spec(
  projectSlug: string,
  relativeCwd: string,
  id: string,
  label: string,
  executable: string,
  args: readonly string[],
  risk: TerminalCommandSpec['risk'],
  options: Pick<TerminalCommandSpec, 'evidenceKind'> &
    Partial<Pick<TerminalCommandSpec, 'timeoutMs' | 'maxOutputBytes' | 'allowedEnvNames'>> = {},
): TerminalCommandSpec {
  return {
    projectSlug,
    relativeCwd,
    id,
    label,
    executable,
    args,
    risk,
    timeoutMs: options.timeoutMs ?? VERIFY_TIMEOUT,
    maxOutputBytes: options.maxOutputBytes ?? OUTPUT_CAP,
    evidenceKind: options.evidenceKind,
    allowedEnvNames: options.allowedEnvNames ?? [],
  };
}

const gitReadCommands = (projectSlug: string, relativeCwd: string): TerminalCommandSpec[] => [
  spec(projectSlug, relativeCwd, 'git.head', 'Read exact Git HEAD', 'git', ['rev-parse', 'HEAD'], 'read'),
  spec(projectSlug, relativeCwd, 'git.status', 'Read Git status', 'git', ['status', '--short', '--branch'], 'read'),
  spec(projectSlug, relativeCwd, 'git.diff-stat', 'Read working-tree diff summary', 'git', ['diff', '--stat'], 'read'),
];

const playwrightSetupCommands = (
  projectSlug: string,
  relativeCwd: string,
): TerminalCommandSpec[] => [
  spec(
    projectSlug,
    relativeCwd,
    'deps.playwright-package',
    `Install Playwright ${PLAYWRIGHT_VERSION} without mutating manifests`,
    'npm',
    [
      'install',
      '--no-save',
      '--package-lock=false',
      '--ignore-scripts',
      `playwright@${PLAYWRIGHT_VERSION}`,
    ],
    'write',
    { timeoutMs: INSTALL_TIMEOUT },
  ),
  spec(
    projectSlug,
    relativeCwd,
    'deps.playwright-browser',
    'Install the pinned Playwright Chromium browser',
    'npm',
    ['exec', '--', 'playwright', 'install', 'chromium'],
    'write',
    { timeoutMs: INSTALL_TIMEOUT },
  ),
];

export const TERMINAL_COMMANDS: readonly TerminalCommandSpec[] = [
  ...gitReadCommands('founder-control-room', 'founder-control-room'),
  spec('founder-control-room', 'founder-control-room', 'deps.install', 'Install locked dependencies', 'npm', ['ci', '--no-audit', '--no-fund'], 'write', {timeoutMs: INSTALL_TIMEOUT}),
  spec('founder-control-room', 'founder-control-room', 'verify.typecheck', 'Typecheck Control Room', 'npm', ['run', 'typecheck'], 'verify', {evidenceKind: 'typecheck'}),
  spec('founder-control-room', 'founder-control-room', 'verify.lint', 'Lint Control Room', 'npm', ['run', 'lint'], 'verify', {evidenceKind: 'lint'}),
  spec('founder-control-room', 'founder-control-room', 'verify.unit', 'Run Control Room tests', 'npm', ['test'], 'verify', {evidenceKind: 'unit_test'}),
  spec('founder-control-room', 'founder-control-room', 'verify.build', 'Build Control Room', 'npm', ['run', 'build'], 'verify', {evidenceKind: 'integration_test'}),

  ...gitReadCommands('juss-beautiful-hair-private', 'jbh-private'),
  spec('juss-beautiful-hair-private', 'jbh-private/admin', 'deps.install', 'Install private hair dependencies', 'npm', ['ci', '--no-audit', '--no-fund'], 'write', {timeoutMs: INSTALL_TIMEOUT}),
  ...playwrightSetupCommands('juss-beautiful-hair-private', 'jbh-private/admin'),
  spec('juss-beautiful-hair-private', 'jbh-private/admin', 'verify.mcp', 'Verify private repository boundaries', 'npm', ['run', 'verify:mcp'], 'verify', {evidenceKind: 'security_scan'}),
  spec('juss-beautiful-hair-private', 'jbh-private/admin', 'verify.typecheck', 'Typecheck private hair control layer', 'npm', ['run', 'check'], 'verify', {evidenceKind: 'typecheck'}),
  spec('juss-beautiful-hair-private', 'jbh-private/admin', 'verify.build', 'Build private hair control layer', 'npm', ['run', 'build'], 'verify', {evidenceKind: 'integration_test'}),
  spec('juss-beautiful-hair-private', 'jbh-private/admin', 'verify.playwright', 'Run private hair Playwright moat checks', 'npm', ['run', 'verify:playwright'], 'verify', {evidenceKind: 'browser_test'}),

  ...gitReadCommands('juss-beautiful-hair', 'jussbeautifulhair-site'),
  spec('juss-beautiful-hair', 'jussbeautifulhair-site', 'deps.install', 'Install public hair dependencies', 'npm', ['ci', '--no-audit', '--no-fund'], 'write', {timeoutMs: INSTALL_TIMEOUT}),
  ...playwrightSetupCommands('juss-beautiful-hair', 'jussbeautifulhair-site'),
  spec('juss-beautiful-hair', 'jussbeautifulhair-site', 'verify.typecheck', 'Typecheck public hair storefront', 'npm', ['run', 'check'], 'verify', {evidenceKind: 'typecheck'}),
  spec('juss-beautiful-hair', 'jussbeautifulhair-site', 'verify.lint', 'Lint public hair storefront', 'npm', ['run', 'lint'], 'verify', {evidenceKind: 'lint'}),
  spec('juss-beautiful-hair', 'jussbeautifulhair-site', 'verify.unit', 'Run public hair unit tests', 'npm', ['test'], 'verify', {evidenceKind: 'unit_test'}),
  spec('juss-beautiful-hair', 'jussbeautifulhair-site', 'verify.build', 'Build public hair storefront', 'npm', ['run', 'build'], 'verify', {evidenceKind: 'integration_test'}),
  spec('juss-beautiful-hair', 'jussbeautifulhair-site', 'verify.deploy-boundary', 'Verify public hair deployment boundary', 'npm', ['run', 'security:deploy-boundary'], 'verify', {evidenceKind: 'security_scan'}),
  spec('juss-beautiful-hair', 'jussbeautifulhair-site', 'verify.playwright', 'Run public hair Playwright moat checks', 'npm', ['run', 'verify:playwright'], 'verify', {evidenceKind: 'browser_test'}),

  ...gitReadCommands('untold-stories', 'untold-stories-storefront'),
  spec('untold-stories', 'untold-stories-storefront', 'deps.install', 'Install Untold Stories dependencies', 'npm', ['ci', '--no-audit', '--no-fund'], 'write', {timeoutMs: INSTALL_TIMEOUT}),
  ...playwrightSetupCommands('untold-stories', 'untold-stories-storefront'),
  spec('untold-stories', 'untold-stories-storefront', 'verify.mcp', 'Verify Untold Stories repository boundaries', 'npm', ['run', 'verify:mcp'], 'verify', {evidenceKind: 'security_scan'}),
  spec('untold-stories', 'untold-stories-storefront', 'verify.typecheck', 'Typecheck Untold Stories', 'npm', ['run', 'typecheck'], 'verify', {evidenceKind: 'typecheck'}),
  spec('untold-stories', 'untold-stories-storefront', 'verify.build', 'Build Untold Stories', 'npm', ['run', 'build'], 'verify', {evidenceKind: 'integration_test'}),
  spec('untold-stories', 'untold-stories-storefront', 'verify.playwright', 'Run Untold Stories Playwright moat checks', 'npm', ['run', 'verify:playwright'], 'verify', {evidenceKind: 'browser_test'}),
] as const;

export function listTerminalCommands(projectSlug: string): TerminalCommandSpec[] {
  return TERMINAL_COMMANDS.filter((command) => command.projectSlug === projectSlug);
}

export function getTerminalCommand(projectSlug: string, commandId: string): TerminalCommandSpec | undefined {
  return TERMINAL_COMMANDS.find(
    (command) => command.projectSlug === projectSlug && command.id === commandId,
  );
}
