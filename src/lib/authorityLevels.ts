/**
 * L0-L6 connector authority levels — the same "no approval carries forward"
 * model as L99 (src/http/routes/l99.ts), applied to MCP/connector
 * capabilities instead of release gates. A connection's `authority_level`
 * describes the HIGHEST thing it is declared allowed to do; actually doing
 * anything at L3 or above still goes through this repo's real gates
 * (requireFounder, proof-gate, approval_executions) — this column is a
 * declaration and inventory aid, not an enforcement mechanism by itself.
 */

export type AuthorityLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';

export interface AuthorityLevelDescriptor {
  level: AuthorityLevel;
  label: string;
}

export const AUTHORITY_LEVELS: readonly AuthorityLevelDescriptor[] = [
  { level: 'L0', label: 'Read public documentation' },
  { level: 'L1', label: 'Inspect project state' },
  { level: 'L2', label: 'Produce recommendation or patch proposal' },
  { level: 'L3', label: 'Execute inside an isolated sandbox' },
  { level: 'L4', label: 'Create branch or external change proposal' },
  { level: 'L5', label: 'Integrate into the project' },
  { level: 'L6', label: 'Deploy, migrate, spend, communicate, or change providers' },
];

export const AUTHORITY_LEVEL_IDS: ReadonlySet<string> = new Set(AUTHORITY_LEVELS.map((a) => a.level));
