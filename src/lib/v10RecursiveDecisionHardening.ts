import { createHash } from 'node:crypto';
import { validateV10DecisionReceipt } from './v10DecisionAuthorityGate.js';

export const V10_RECURSIVE_HARDENING_CONTRACT = 'juss-v10/recursive-hardening@v1';
export const V10_RECURSIVE_ATTACK_MODES = Object.freeze([
  'authority-inversion',
  'evidence-falsification',
  'human-outcome',
  'temporal-race',
] as const);
export const V10_RECURSIVE_REQUIRED_SKILLS = Object.freeze([
  'human', 'me', 'futureyou', 'truthmode', 'confess', 'billgates', 'elonmusk',
  'ooda', 'redteam', 'lindymode', 'data-analytics', 'product-design',
  'deep-research', 'steal', 'l99', 'ultrathink', 'unlearn', '80-20',
  'antiadvice', 'first-principles', 'ycombinator', 'socrates',
] as const);

const HASH = /^[0-9a-f]{64}$/i;
const ATTACK_MODE_SET = new Set<string>(V10_RECURSIVE_ATTACK_MODES);
const DISPOSITIONS = new Set(['survived', 'revised', 'blocked']);
type JsonRecord = Record<string, unknown>;

interface NormalizedAttack {
  mode: string;
  finding: string;
  falsifier: string;
  evidenceRefs: string[];
  skills: string[];
  disposition: string;
}

interface NormalizedCycle {
  cycle: number;
  inputConclusionHash: string;
  observation: string;
  orientation: string;
  attacks: NormalizedAttack[];
  decision: string;
  outputConclusion: string;
  outputConclusionHash: string;
}

interface NormalizedHardening {
  contract: string;
  decisionHash: string;
  initialConclusion: string;
  initialConclusionHash: string;
  attackModes: string[];
  cycles: NormalizedCycle[];
  finalConclusion: string;
  finalConclusionHash: string;
  finalDisposition: string;
  skillsCovered: string[];
  authorityCeiling: 'reason';
  requiresFounderApproval: true;
  executionAuthorized: false;
}

export interface V10RecursiveHardeningValidation {
  valid: boolean;
  authorityEligible: boolean;
  hardeningHash: string | null;
  decisionHash: string | null;
  errors: string[];
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function text(value: unknown, max = 4_000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function strings(value: unknown, maxItems = 60, max = 1_000): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item, max)).filter(Boolean))]
    .sort()
    .slice(0, maxItems);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeAttack(value: unknown): NormalizedAttack {
  const raw = record(value) ?? {};
  return {
    mode: text(raw.mode, 80).toLowerCase(),
    finding: text(raw.finding, 3_000),
    falsifier: text(raw.falsifier, 3_000),
    evidenceRefs: strings(raw.evidenceRefs, 30),
    skills: strings(raw.skills, 30, 120).map((skill) => skill.toLowerCase()),
    disposition: text(raw.disposition, 40).toLowerCase(),
  };
}

function normalizeCycle(value: unknown): NormalizedCycle {
  const raw = record(value) ?? {};
  return {
    cycle: Number.isInteger(raw.cycle) ? Number(raw.cycle) : 0,
    inputConclusionHash: text(raw.inputConclusionHash, 64).toLowerCase(),
    observation: text(raw.observation, 3_000),
    orientation: text(raw.orientation, 3_000),
    attacks: Array.isArray(raw.attacks)
      ? raw.attacks.map(normalizeAttack).sort((left, right) => left.mode.localeCompare(right.mode))
      : [],
    decision: text(raw.decision, 40).toLowerCase(),
    outputConclusion: text(raw.outputConclusion),
    outputConclusionHash: text(raw.outputConclusionHash, 64).toLowerCase(),
  };
}

function normalizeHardening(value: unknown): NormalizedHardening | null {
  const raw = record(value);
  if (!raw) return null;
  return {
    contract: V10_RECURSIVE_HARDENING_CONTRACT,
    decisionHash: text(raw.decisionHash, 64).toLowerCase(),
    initialConclusion: text(raw.initialConclusion),
    initialConclusionHash: text(raw.initialConclusionHash, 64).toLowerCase(),
    attackModes: strings(raw.attackModes, 10, 80).map((mode) => mode.toLowerCase()),
    cycles: Array.isArray(raw.cycles) ? raw.cycles.map(normalizeCycle) : [],
    finalConclusion: text(raw.finalConclusion),
    finalConclusionHash: text(raw.finalConclusionHash, 64).toLowerCase(),
    finalDisposition: text(raw.finalDisposition, 40).toLowerCase(),
    skillsCovered: strings(raw.skillsCovered, 60, 120).map((skill) => skill.toLowerCase()),
    authorityCeiling: 'reason',
    requiresFounderApproval: true,
    executionAuthorized: false,
  };
}

function hardeningSeed(receipt: NormalizedHardening): string {
  return JSON.stringify([
    receipt.contract,
    receipt.decisionHash,
    receipt.initialConclusion,
    receipt.initialConclusionHash,
    receipt.attackModes,
    receipt.cycles.map((entry) => [
      entry.cycle,
      entry.inputConclusionHash,
      entry.observation,
      entry.orientation,
      entry.attacks.map((item) => [
        item.mode,
        item.finding,
        item.falsifier,
        item.evidenceRefs,
        item.skills,
        item.disposition,
      ]),
      entry.decision,
      entry.outputConclusion,
      entry.outputConclusionHash,
    ]),
    receipt.finalConclusion,
    receipt.finalConclusionHash,
    receipt.finalDisposition,
    receipt.skillsCovered,
    receipt.authorityCeiling,
    receipt.requiresFounderApproval,
    receipt.executionAuthorized,
  ]);
}

export function v10RecursiveHardeningHash(value: unknown): string | null {
  const receipt = normalizeHardening(value);
  return receipt ? sha256(hardeningSeed(receipt)) : null;
}

/**
 * Independently validate Chief/PromptOS recursive reasoning as proof context.
 * Passing this validator does not grant merge, deploy, publish, or provider authority.
 */
export function validateV10RecursiveHardening(
  decisionReceipt: unknown,
  hardeningReceipt: unknown,
): V10RecursiveHardeningValidation {
  const errors = validateV10DecisionReceipt(decisionReceipt).map((error) => `base decision: ${error}`);
  const decision = record(decisionReceipt);
  const hardening = normalizeHardening(hardeningReceipt);
  const rawHardening = record(hardeningReceipt);

  if (!decision) errors.push('base decision receipt shape is invalid');
  if (!hardening || !rawHardening) {
    return {
      valid: false,
      authorityEligible: false,
      hardeningHash: null,
      decisionHash: decision ? text(decision.decisionHash, 64).toLowerCase() || null : null,
      errors: [...new Set([...errors, 'recursive hardening receipt shape is invalid'])],
    };
  }

  const baseDecisionHash = decision ? text(decision.decisionHash, 64).toLowerCase() : '';
  const baseRecommendation = decision ? text(decision.recommendation) : '';
  if (rawHardening.contract !== V10_RECURSIVE_HARDENING_CONTRACT) errors.push('unsupported recursive hardening contract');
  if (!HASH.test(hardening.decisionHash)) errors.push('recursive hardening decisionHash must be sha256');
  if (hardening.decisionHash !== baseDecisionHash) errors.push('recursive hardening decisionHash does not match base decision');
  if (hardening.initialConclusion !== baseRecommendation) errors.push('recursive hardening must attack the base decision recommendation');
  if (hardening.initialConclusionHash !== sha256(hardening.initialConclusion)) errors.push('recursive hardening initial conclusion hash mismatch');
  if (hardening.attackModes.length !== 4
    || V10_RECURSIVE_ATTACK_MODES.some((mode) => !hardening.attackModes.includes(mode))) {
    errors.push('recursive hardening requires exactly four canonical attack modes');
  }
  if (hardening.cycles.length !== 10) errors.push('recursive hardening requires exactly 10 OODA cycles');

  let priorHash = hardening.initialConclusionHash;
  let survived = true;
  const observedSkills = new Set<string>();
  hardening.cycles.forEach((entry, index) => {
    const number = index + 1;
    if (entry.cycle !== number) errors.push(`recursive hardening cycle ${number} number mismatch`);
    if (entry.inputConclusionHash !== priorHash) errors.push(`recursive hardening cycle ${number} input conclusion is stale`);
    if (!entry.observation) errors.push(`recursive hardening cycle ${number} observation is required`);
    if (!entry.orientation) errors.push(`recursive hardening cycle ${number} orientation is required`);
    if (entry.attacks.length !== 4) errors.push(`recursive hardening cycle ${number} requires four attacks`);

    const modes = new Set<string>();
    const findings = new Set<string>();
    const cycleSkills = new Set<string>();
    for (const item of entry.attacks) {
      if (!ATTACK_MODE_SET.has(item.mode)) errors.push(`recursive hardening cycle ${number} has unsupported attack mode: ${item.mode}`);
      if (modes.has(item.mode)) errors.push(`recursive hardening cycle ${number} repeats attack mode: ${item.mode}`);
      modes.add(item.mode);
      if (!item.finding) errors.push(`recursive hardening cycle ${number} ${item.mode} finding is required`);
      if (findings.has(item.finding)) errors.push(`recursive hardening cycle ${number} repeats an attack finding`);
      findings.add(item.finding);
      if (!item.falsifier) errors.push(`recursive hardening cycle ${number} ${item.mode} falsifier is required`);
      if (item.evidenceRefs.length === 0) errors.push(`recursive hardening cycle ${number} ${item.mode} evidence is required`);
      if (!DISPOSITIONS.has(item.disposition)) errors.push(`recursive hardening cycle ${number} ${item.mode} disposition is invalid`);
      if (item.disposition !== 'survived') survived = false;
      item.skills.forEach((skill) => {
        cycleSkills.add(skill);
        observedSkills.add(skill);
      });
    }
    V10_RECURSIVE_ATTACK_MODES.forEach((mode) => {
      if (!modes.has(mode)) errors.push(`recursive hardening cycle ${number} missing attack mode: ${mode}`);
    });
    for (const skill of ['redteam', 'ooda']) {
      if (!cycleSkills.has(skill)) errors.push(`recursive hardening cycle ${number} must exercise ${skill}`);
    }
    if (!DISPOSITIONS.has(entry.decision)) errors.push(`recursive hardening cycle ${number} decision is invalid`);
    if (entry.decision !== 'survived') survived = false;
    if (entry.outputConclusionHash !== sha256(entry.outputConclusion)) errors.push(`recursive hardening cycle ${number} output conclusion hash mismatch`);
    if (entry.decision === 'survived' && entry.outputConclusionHash !== priorHash) {
      errors.push(`recursive hardening cycle ${number} cannot revise a survived conclusion`);
    }
    priorHash = entry.outputConclusionHash;
  });

  V10_RECURSIVE_REQUIRED_SKILLS.forEach((skill) => {
    if (!observedSkills.has(skill)) errors.push(`recursive hardening missing required skill coverage: ${skill}`);
  });
  if (JSON.stringify(hardening.skillsCovered) !== JSON.stringify([...observedSkills].sort())) {
    errors.push('recursive hardening skillsCovered does not match observed attack skills');
  }
  const finalCycle = hardening.cycles[hardening.cycles.length - 1];
  if (hardening.finalConclusion !== (finalCycle?.outputConclusion ?? '')) errors.push('recursive hardening final conclusion does not match cycle 10');
  if (hardening.finalConclusionHash !== sha256(hardening.finalConclusion) || hardening.finalConclusionHash !== priorHash) {
    errors.push('recursive hardening final conclusion hash mismatch');
  }
  if (!DISPOSITIONS.has(hardening.finalDisposition)) errors.push('recursive hardening final disposition is invalid');
  if (hardening.finalDisposition !== 'survived') survived = false;
  if (hardening.finalDisposition === 'survived' && hardening.finalConclusionHash !== hardening.initialConclusionHash) {
    errors.push('recursive hardening survived disposition requires the original conclusion to remain unchanged');
  }

  if (rawHardening.authorityCeiling !== 'reason') errors.push('recursive hardening cannot exceed reason authority');
  if (rawHardening.requiresFounderApproval !== true) errors.push('recursive hardening must preserve founder approval');
  if (rawHardening.executionAuthorized !== false) errors.push('recursive hardening cannot authorize execution');

  const computedHash = v10RecursiveHardeningHash(hardening);
  const submittedHash = text(rawHardening.hardeningHash, 64).toLowerCase();
  if (!HASH.test(submittedHash)) errors.push('recursive hardening hardeningHash must be sha256');
  else if (!computedHash || computedHash !== submittedHash) errors.push('recursive hardening hash does not match receipt content');

  const uniqueErrors = [...new Set(errors)];
  return Object.freeze({
    valid: uniqueErrors.length === 0,
    authorityEligible: uniqueErrors.length === 0
      && survived
      && hardening.finalConclusionHash === hardening.initialConclusionHash,
    hardeningHash: computedHash,
    decisionHash: baseDecisionHash || null,
    errors: uniqueErrors,
  });
}
