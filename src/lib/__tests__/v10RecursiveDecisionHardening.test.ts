import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  V10_RECURSIVE_ATTACK_MODES,
  V10_RECURSIVE_REQUIRED_SKILLS,
  v10RecursiveHardeningHash,
  validateV10RecursiveHardening,
} from '../v10RecursiveDecisionHardening.js';

const EXPECTED_HARDENING_HASH = '2a6fe422c22e376c483e6fd366b3b93cf06bc290fbe682609dad8459438a4d98';
const decision = JSON.parse(
  readFileSync(new URL('../../../testdata/v10-decision-cycle-conformance.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;
const hardening = JSON.parse(
  readFileSync(new URL('../../../testdata/v10-recursive-hardening-conformance.json', import.meta.url), 'utf8'),
) as Record<string, unknown> & { cycles: Array<Record<string, unknown> & { attacks: Array<Record<string, unknown>> }> };
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('V10 recursive decision hardening authority context', () => {
  it('independently rederives the canonical four-way ten-cycle identity', () => {
    const result = validateV10RecursiveHardening(decision, hardening);
    expect(result).toEqual({
      valid: true,
      authorityEligible: true,
      hardeningHash: EXPECTED_HARDENING_HASH,
      decisionHash: decision.decisionHash,
      errors: [],
    });
    expect(v10RecursiveHardeningHash(hardening)).toBe(EXPECTED_HARDENING_HASH);
    expect(hardening.cycles).toHaveLength(10);
    for (const cycle of hardening.cycles) {
      expect(cycle.attacks.map((attack) => attack.mode).sort()).toEqual([...V10_RECURSIVE_ATTACK_MODES].sort());
    }
    const skills = new Set(
      hardening.cycles.flatMap((cycle) => cycle.attacks.flatMap((attack) => Array.isArray(attack.skills) ? attack.skills : [])),
    );
    expect(V10_RECURSIVE_REQUIRED_SKILLS.every((skill) => skills.has(skill))).toBe(true);
  });

  it('fails closed on a stale OODA cycle', () => {
    const stale = clone(hardening);
    stale.cycles[3].inputConclusionHash = 'f'.repeat(64);
    stale.hardeningHash = v10RecursiveHardeningHash(stale);
    const result = validateV10RecursiveHardening(decision, stale);
    expect(result.valid).toBe(false);
    expect(result.authorityEligible).toBe(false);
    expect(result.errors).toContain('recursive hardening cycle 4 input conclusion is stale');
  });

  it('fails closed on duplicate four-way attacks', () => {
    const duplicate = clone(hardening);
    duplicate.cycles[0].attacks[1].mode = duplicate.cycles[0].attacks[0].mode;
    duplicate.cycles[0].attacks[1].finding = duplicate.cycles[0].attacks[0].finding;
    duplicate.hardeningHash = v10RecursiveHardeningHash(duplicate);
    const result = validateV10RecursiveHardening(decision, duplicate);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('repeats attack mode'))).toBe(true);
    expect(result.errors.some((error) => error.includes('repeats an attack finding'))).toBe(true);
  });

  it('never treats recursive reasoning as execution authority', () => {
    const escalated = clone(hardening);
    escalated.authorityCeiling = 'privileged';
    escalated.requiresFounderApproval = false;
    escalated.executionAuthorized = true;
    escalated.hardeningHash = v10RecursiveHardeningHash(escalated);
    const result = validateV10RecursiveHardening(decision, escalated);
    expect(result.valid).toBe(false);
    expect(result.authorityEligible).toBe(false);
    expect(result.errors).toContain('recursive hardening cannot exceed reason authority');
    expect(result.errors).toContain('recursive hardening must preserve founder approval');
    expect(result.errors).toContain('recursive hardening cannot authorize execution');
  });
});
