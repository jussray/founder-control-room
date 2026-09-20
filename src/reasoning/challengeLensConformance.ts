import type { CloudflareReasoningReport } from './cloudflare/types.js';

export const PROMPTOS_CHALLENGE_LENS_CONTRACT = 'promptos/ai-mastery-v6@6.0.0' as const;

export const FCR_CHALLENGE_LENS_CONFORMANCE = Object.freeze({
  contract: PROMPTOS_CHALLENGE_LENS_CONTRACT,
  authorityEffect: 'none',
  billgates: Object.freeze({
    role: 'durable-leverage',
    objective: 'durable_growth',
    behaviors: Object.freeze([
      'identify-the-bottleneck-and-highest-leverage-point',
      'prefer-stable-options-and-reversible-changes',
      'prefer-generated-docs-shared-fixtures-and-reusable-artifacts',
      'standardize-a-proven-path-before-scaling',
      'do-not-scale-an-unproven-path',
    ]),
  }),
  elonmusk: Object.freeze({
    role: 'first-principles-execution',
    objective: 'upside_growth',
    behaviors: Object.freeze([
      'question-requirements-before-accepting-them',
      'delete-before-optimizing',
      'simplify-from-first-principles',
      'prefer-fast-small-reversible-experiments',
      'accelerate-feedback-and-automate-last',
    ]),
  }),
});

export function validateCloudflareChallengeLensSpecialization(
  report: Pick<CloudflareReasoningReport, 'billGates' | 'elonMusk' | 'mode' | 'approvalCarryForward'>,
): string[] {
  const errors: string[] = [];

  if (report.mode !== 'read_only_reasoning') errors.push('challenge lenses must remain read-only reasoning');
  if (report.approvalCarryForward !== false) errors.push('challenge lenses cannot carry approval forward');

  if (!report.billGates.bottleneck.trim()) errors.push('billgates bottleneck missing');
  if (!report.billGates.leveragePoint.trim()) errors.push('billgates leverage point missing');
  if (!/desired.+built.+deployed.+healthy.+verified/i.test(report.billGates.standardize)) {
    errors.push('billgates standardization path missing');
  }
  if (!/do not automate.+until one project completes deploy, verify, rollback, and recovery/i.test(report.billGates.doNotScaleYet)) {
    errors.push('billgates do-not-scale boundary missing');
  }

  if (!/requirement/i.test(report.elonMusk.questionRequirements)) errors.push('elonmusk requirement challenge missing');
  if (!/^delete\b/i.test(report.elonMusk.deleteBeforeOptimize)) errors.push('elonmusk delete-before-optimize missing');
  if (!/one deployment authority.+one exact-commit evidence contract.+one runtime health proof/i.test(report.elonMusk.simplify)) {
    errors.push('elonmusk simplification boundary missing');
  }
  if (!/observe.+reason.+verify/i.test(report.elonMusk.accelerateFeedback)) errors.push('elonmusk feedback loop missing');
  if (!/automate only.+until repeated deploy, rollback, and recovery/i.test(report.elonMusk.automateLast)) {
    errors.push('elonmusk automate-last boundary missing');
  }

  return errors;
}
