export const COUNCIL_SPECIALIST_CONTRIBUTION_CONTRACT = 'fcr.council-specialist-contribution.v1' as const;

export const COUNCIL_SPECIALIST_POSITIONS = ['support', 'conditional', 'oppose', 'abstain'] as const;

export type CouncilSpecialistPosition = (typeof COUNCIL_SPECIALIST_POSITIONS)[number];

export interface CouncilSpecialistSeatBinding {
  role: string;
  domain: string;
}

export interface CouncilSpecialistContribution {
  contract: typeof COUNCIL_SPECIALIST_CONTRIBUTION_CONTRACT;
  role: string;
  domain: string;
  position: CouncilSpecialistPosition;
  conclusion: string;
  recommendation: string;
  assumptions: string[];
  confidence: number;
  risks: string[];
  dependencies: string[];
}

const POSITION_SET = new Set<string>(COUNCIL_SPECIALIST_POSITIONS);
const FORBIDDEN_KEYS = new Set([
  'reality',
  'evidence',
  'evidenceRefs',
  'receiptIds',
  'authority',
  'approved',
  'merge',
  'deploy',
  'publish',
]);

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function stringList(value: unknown, maxItems = 30, maxLength = 2_000): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function normalizedBinding(binding: CouncilSpecialistSeatBinding): CouncilSpecialistSeatBinding {
  const role = text(binding.role, 120);
  const domain = text(binding.domain, 120).toLowerCase();
  if (!role) throw new Error('specialist role is required');
  if (!domain) throw new Error('specialist domain is required');
  return { role, domain };
}

export function councilSpecialistGoal(
  goal: string,
  binding: CouncilSpecialistSeatBinding,
): string {
  const specialist = normalizedBinding(binding);
  return [
    goal.trim(),
    '',
    'You are filling one bounded Specialist Report seat for Chief AI Executive Council.',
    `Role: ${specialist.role}`,
    `Domain: ${specialist.domain}`,
    'Return JSON only. Do not wrap it in markdown.',
    `The JSON contract must be "${COUNCIL_SPECIALIST_CONTRIBUTION_CONTRACT}".`,
    'Required fields: contract, role, domain, position, conclusion, recommendation, assumptions, confidence, risks, dependencies.',
    'position must be one of: support, conditional, oppose, abstain.',
    'confidence must be an integer from 0 to 100.',
    'If position is conditional, dependencies must contain at least one item.',
    'Do not emit reality, evidence, receiptIds, authority, approval, merge, deploy, or publish fields.',
    'Operational reality is supplied separately by Founder Control Room evidence ingestion. Your output is analysis, not authority.',
  ].join('\n');
}

export function parseCouncilSpecialistContribution(
  answer: string,
  binding: CouncilSpecialistSeatBinding,
): CouncilSpecialistContribution {
  const specialist = normalizedBinding(binding);
  let parsed: unknown;
  try {
    parsed = JSON.parse(answer);
  } catch {
    throw new Error('specialist contribution must be valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('specialist contribution must be a JSON object');
  }

  const record = parsed as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new Error(`specialist contribution cannot carry ${key}`);
    }
  }

  if (record.contract !== COUNCIL_SPECIALIST_CONTRIBUTION_CONTRACT) {
    throw new Error('specialist contribution contract mismatch');
  }

  const role = text(record.role, 120);
  const domain = text(record.domain, 120).toLowerCase();
  if (role !== specialist.role) throw new Error('specialist contribution role does not match assigned seat');
  if (domain !== specialist.domain) throw new Error('specialist contribution domain does not match assigned seat');

  const position = typeof record.position === 'string' ? record.position : '';
  if (!POSITION_SET.has(position)) throw new Error('specialist contribution position is unsupported');

  const conclusion = text(record.conclusion, 3_000);
  const recommendation = text(record.recommendation, 3_000);
  if (!conclusion) throw new Error('specialist contribution conclusion is required');
  if (!recommendation) throw new Error('specialist contribution recommendation is required');

  const confidence = record.confidence;
  if (typeof confidence !== 'number' || !Number.isInteger(confidence) || confidence < 0 || confidence > 100) {
    throw new Error('specialist contribution confidence must be an integer from 0 to 100');
  }

  const assumptions = stringList(record.assumptions);
  const risks = stringList(record.risks);
  const dependencies = stringList(record.dependencies);
  if (position === 'conditional' && dependencies.length === 0) {
    throw new Error('conditional specialist contribution requires at least one dependency');
  }

  return {
    contract: COUNCIL_SPECIALIST_CONTRIBUTION_CONTRACT,
    role,
    domain,
    position: position as CouncilSpecialistPosition,
    conclusion,
    recommendation,
    assumptions,
    confidence,
    risks,
    dependencies,
  };
}
