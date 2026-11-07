export type SourceAuthorityDecision = 'canonical' | 'conflict' | 'unknown';

export type ProductionSurfaceProvider = 'cloudflare' | 'oxygen' | 'other';

export interface ProductionSurface {
  product: string;
  surface: string;
  environment: 'production';
  canonicalUrl?: string;
  provider: ProductionSurfaceProvider;
}

export interface SourceAuthoritySource {
  repository: string;
  branch: string;
  sha: string;
  evidenceRef: string;
}

export interface SourceAuthorityDeployment {
  providerProject: string;
  deploymentId: string;
  artifactId?: string;
  artifactSourceSha?: string;
  evidenceRef: string;
}

export interface SourceAuthorityRuntime {
  canonicalUrl: string;
  releaseIdentity: string;
  evidenceRef: string;
}

export interface SourceAuthorityObservation {
  surface: ProductionSurface;
  observedAt: string;
  source: SourceAuthoritySource;
  deployment?: SourceAuthorityDeployment;
  runtime?: SourceAuthorityRuntime;
}

export interface SourceAuthorityEvaluation {
  decision: SourceAuthorityDecision;
  reason: string;
}

export type SourceAuthorityRecord = SourceAuthorityObservation & SourceAuthorityEvaluation;

function isPresent(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function evaluateSourceAuthority(
  observation: SourceAuthorityObservation,
): SourceAuthorityEvaluation {
  const { surface, source, deployment, runtime } = observation;

  const artifactSourceSha = deployment?.artifactSourceSha;
  const runtimeIdentity = runtime?.releaseIdentity;

  if (isPresent(artifactSourceSha) && source.sha !== artifactSourceSha) {
    return {
      decision: 'conflict',
      reason: 'source SHA differs from production artifact source SHA',
    };
  }

  if (isPresent(runtimeIdentity) && source.sha !== runtimeIdentity) {
    return {
      decision: 'conflict',
      reason: 'source SHA differs from canonical runtime release identity',
    };
  }

  if (
    isPresent(artifactSourceSha)
    && isPresent(runtimeIdentity)
    && artifactSourceSha !== runtimeIdentity
  ) {
    return {
      decision: 'conflict',
      reason: 'production artifact source SHA differs from canonical runtime release identity',
    };
  }

  if (
    isPresent(surface.canonicalUrl)
    && runtime
    && isPresent(runtime.canonicalUrl)
    && surface.canonicalUrl !== runtime.canonicalUrl
  ) {
    return {
      decision: 'conflict',
      reason: 'runtime witness is not attributable to the named canonical production surface',
    };
  }

  if (
    !isPresent(surface.product)
    || !isPresent(surface.surface)
    || surface.environment !== 'production'
    || !isPresent(surface.provider)
    || !Number.isFinite(Date.parse(observation.observedAt))
    || !isPresent(source.repository)
    || !isPresent(source.branch)
    || !isPresent(source.sha)
    || !isPresent(source.evidenceRef)
  ) {
    return {
      decision: 'unknown',
      reason: 'source observation is incomplete or unattributable',
    };
  }

  if (
    !deployment
    || !isPresent(deployment.providerProject)
    || !isPresent(deployment.deploymentId)
    || !isPresent(deployment.artifactSourceSha)
    || !isPresent(deployment.evidenceRef)
  ) {
    return {
      decision: 'unknown',
      reason: 'production deployment evidence is incomplete or unavailable',
    };
  }

  if (
    !runtime
    || !isPresent(runtime.canonicalUrl)
    || !isPresent(runtime.releaseIdentity)
    || !isPresent(runtime.evidenceRef)
  ) {
    return {
      decision: 'unknown',
      reason: 'canonical runtime evidence is incomplete or unavailable',
    };
  }

  return {
    decision: 'canonical',
    reason: 'source, production artifact, and canonical runtime identities match',
  };
}
