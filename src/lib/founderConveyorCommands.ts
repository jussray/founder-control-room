export const FOUNDER_CONVEYOR_COMMANDS = {
  '/hormozi': { kind: 'thinking', description: 'Offer/value framing and constraint-focused packaging.' },
  '/unlearn': { kind: 'thinking', description: 'Challenge inherited assumptions before selecting a path.' },
  '/human': { kind: 'output', description: 'Natural direct output with minimal AI-style padding.' },
  '/truthmode': { kind: 'thinking', description: 'Prefer direct evidence-backed claims over social smoothing.' },
  '80/20': { kind: 'thinking', description: 'Prioritize the smallest actions with the highest expected leverage.' },
  'futureyou': { kind: 'thinking', description: 'Evaluate the choice from the perspective of future durable value.' },
  'antiadvice': { kind: 'thinking', description: 'Invert common advice to expose assumptions and failure modes.' },
  'first-principles': { kind: 'thinking', description: 'Reduce the problem to constraints and reconstruct from fundamentals.' },
  'ycombinator': { kind: 'thinking', description: 'Favor customer value, speed, simple scope, and evidence of demand.' },
  'socrates': { kind: 'thinking', description: 'Interrogate assumptions with focused questions before commitment.' },
  '/compact': { kind: 'context', description: 'Compress resumable execution state without changing the active goal.' },
  '/btw': { kind: 'context', description: 'Route a side inquiry without mutating the active conveyor goal.' },
  '/loop': { kind: 'monitor', description: 'Create a recurring condition check; does not grant action authority.' },
  '/goal': { kind: 'execution', description: 'Bind work to an explicit finish condition and verification gate.' },
  '/resume': { kind: 'context', description: 'Restore a previously persisted conveyor run from its receipt/state.' },
  '/plan': { kind: 'execution', description: 'Produce a bounded change plan before mutations begin.' },
  '/effort': { kind: 'execution', description: 'Set reasoning budget without changing authority or verification requirements.' },
  '/caveman': { kind: 'output', description: 'Compress explanation to the simplest workable language and steps.' },
  '/v10': { kind: 'thinking', description: 'Pressure-test whether the proposed version is materially stronger, not merely larger.' },
  '/insights': { kind: 'analysis', description: 'Extract reusable patterns from verified run evidence.' },
  '/ultrathink': { kind: 'thinking', description: 'Use deeper architecture reasoning for genuinely complex decisions.' },
} as const;

export type FounderConveyorCommand = keyof typeof FOUNDER_CONVEYOR_COMMANDS;
export type FounderConveyorCommandSource = 'founder-control' | 'untrusted';

const NORMALIZED = new Map<string, FounderConveyorCommand>(
  Object.keys(FOUNDER_CONVEYOR_COMMANDS).map((command) => [command.toLowerCase(), command as FounderConveyorCommand]),
);

export function normalizeFounderConveyorCommand(value: string): FounderConveyorCommand | null {
  const normalized = value.trim().toLowerCase().replace(/^\/hormozi$/, '/hormozi');
  return NORMALIZED.get(normalized) ?? null;
}

export function parseFounderConveyorCommands(
  input: string,
  options: { source?: FounderConveyorCommandSource } = {},
): FounderConveyorCommand[] {
  // Command words inside emails, webpages, issues, MCP/tool results, imported docs,
  // or any other untrusted text are data, never workflow authority. A caller must
  // already be on the authenticated founder-control surface before parsing can occur.
  if (options.source !== 'founder-control') return [];

  const matches = input.match(/(?:^|\s)(\/[A-Za-z0-9-]+|80\/20|FutureYOU|Antiadvice|First principles|YCOMBINATOR|SOCRATES)(?=\s|$)/gi) ?? [];
  const resolved: FounderConveyorCommand[] = [];

  for (const raw of matches) {
    let token = raw.trim().toLowerCase();
    if (token === 'first principles') token = 'first-principles';
    const command = normalizeFounderConveyorCommand(token);
    if (command && !resolved.includes(command)) resolved.push(command);
  }

  return resolved;
}

export const COMMANDS_WITHOUT_DIRECT_MUTATION_AUTHORITY = new Set<FounderConveyorCommand>([
  '/compact', '/btw', '/loop', '/resume', '/effort', '/caveman', '/insights',
  '/hormozi', '/unlearn', '/human', '/truthmode', '80/20', 'futureyou', 'antiadvice',
  'first-principles', 'ycombinator', 'socrates', '/ultrathink', '/v10',
]);
