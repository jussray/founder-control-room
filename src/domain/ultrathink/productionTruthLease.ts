import {
  evaluateSourceAuthority,
  type ProductionSurface,
  type SourceAuthorityRecord,
} from './sourceAuthority.js';

export type ProductionTruthStatus = 'pass' | 'fail' | 'blocked';

export interface RuntimeHealthWitness {
  result: ProductionTruthStatus;
  evidenceRef: string;
}

export interface DataAuthWitness {
  provider: 'supabase' | 'other';
  projectRef: string;
  result: ProductionTruthStatus;
  evidenceRef: string;
}

export interface ExperienceWitness {
  scenario: string;
  result: ProductionTruthStatus;
  evidenceRef: string;
}

export interface ProductionTruthLeaseObservation {
  surface: ProductionSurface;
  observedAt: string;
  sourceAuthority: SourceAuthorityRecord;
  runtime: RuntimeHealthWitness;
  dataAuth: DataAuthWitness;
  experience: ExperienceWitness;
}

export interface ProductionTruthLeaseEvaluation {
  result: ProductionTruthStatus;
  reason: string;
}

export type ProductionTruthLease = ProductionTruthLeaseObservation & ProductionTruthLeaseEvaluation;

function isPresent(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function sameSurface(left: ProductionSurface, right: ProductionSurface): boolean {
  return left.product === right.product
    && left.surface === right.surface
    && left.environment === right.environment
    && left.provider === right.provider
    && (left.canonicalUrl ?? '') === (right.canonicalUrl ?? '');
}

export function evaluateProductionTruthLease(
  observation: ProductionTruthLeaseObservation,
): ProductionTruthLeaseEvaluation {
  if (
    !isPresent(observation.surface.product)
    || !isPresent(observation.surface.surface)
    || observation.surface.environment !== 'production'
    || !Number.isFinite(Date.parse(observation.observedAt))
  ) {
    return {
      result: 'blocked',
      reason: 'production lease observation is incomplete or malformed',
    };
  }

  if (!sameSurface(observation.surface, observation.sourceAuthority.surface)) {
    return {
      result: 'fail',
      reason: 'source authority record belongs to a different production surface',
    };
  }

  const authorityEvaluation = evaluateSourceAuthority(observation.sourceAuthority);

  if (authorityEvaluation.decision !== observation.sourceAuthority.decision) {
    return {
      result: 'fail',
      reason: 'source authority record decision is inconsistent with its evidence',
    };
  }

  if (authorityEvaluation.decision === 'conflict') {
    return {
      result: 'fail',
      reason: 'source authority is in conflict',
    };
  }

  if (authorityEvaluation.decision === 'unknown') {
    return {
      result: 'blocked',
      reason: 'source authority is not canonical',
    };
  }

  if (
    !isPresent(observation.runtime.evidenceRef)
    || !isPresent(observation.dataAuth.projectRef)
    || !isPresent(observation.dataAuth.evidenceRef)
    || !isPresent(observation.experience.scenario)
    || !isPresent(observation.experience.evidenceRef)
  ) {
    return {
      result: 'blocked',
      reason: 'required production witness evidence is missing',
    };
  }

  if (
    observation.runtime.result === 'fail'
    || observation.dataAuth.result === 'fail'
    || observation.experience.result === 'fail'
  ) {
    return {
      result: 'fail',
      reason: 'one or more production witnesses failed',
    };
  }

  if (
    observation.runtime.result === 'blocked'
    || observation.dataAuth.result === 'blocked'
    || observation.experience.result === 'blocked'
  ) {
    return {
      result: 'blocked',
      reason: 'one or more production witnesses are blocked',
    };
  }

  return {
    result: 'pass',
    reason: 'canonical source authority and all production witnesses pass',
  };
}
