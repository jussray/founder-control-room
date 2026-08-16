import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../middleware/requireFounder.js', () => ({
  requireFounder: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { securityPostureRouter } = await import('./securityPosture.js');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/security-posture', securityPostureRouter);
  return app;
}

describe('Strategic Security Posture API', () => {
  it('returns target posture without claiming proof or certification', async () => {
    const response = await request(createTestApp()).get('/security-posture');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.contract).toBe('juss-v10/security-posture@v1');
    expect(response.body.summary.totalProjects).toBe(8);
    expect(response.body.summary.provenProjects).toBe(0);
    expect(response.body.projects.every((project: { assessmentState: string }) => project.assessmentState === 'target_only')).toBe(true);
    expect(response.body.truthBoundaries.targetVersionIsNotCurrentMaturity).toBe(true);
    expect(response.body.truthBoundaries.frameworkMappingIsNotCertification).toBe(true);
    expect(response.body.truthBoundaries.providerClaimsRequireRuntimeEvidence).toBe(true);
  });

  it('publishes defensive Lantern constraints as read-only posture data', async () => {
    const response = await request(createTestApp()).get('/security-posture');

    expect(response.status).toBe(200);
    expect(response.body.lantern.valid).toBe(true);
    expect(response.body.lantern.policy.hackBackAllowed).toBe(false);
    expect(response.body.lantern.policy.realDataAllowed).toBe(false);
    expect(response.body.lantern.policy.outboundAttackCapabilityAllowed).toBe(false);
    expect(response.body.lantern.policy.humanIdentityClaimFromNetworkSignalAllowed).toBe(false);
  });

  it('has no mutation route', async () => {
    const response = await request(createTestApp())
      .post('/security-posture')
      .send({ targetVersion: 1 });

    expect(response.status).toBe(404);
  });
});
