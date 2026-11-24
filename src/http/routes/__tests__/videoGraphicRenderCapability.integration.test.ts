import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boundFounderRow } from './founderAuthFixture.js';

const { mockGetUser, mockReadEffectiveDesiredState, supabaseMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockReadEffectiveDesiredState: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
  createSupabaseAuthClient: vi.fn(),
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));
vi.mock('../../../switchboard/store.js', () => ({
  readEffectiveDesiredState: mockReadEffectiveDesiredState,
  SwitchboardError: class SwitchboardError extends Error {},
}));

import express from 'express';
import request from 'supertest';
import { capabilitiesRouter } from '../capabilities.js';

const BEARER = 'Bearer test-token';
const FOUNDER_EMAIL = 'founder@example.com';
const FOUNDER_USER_ID = 'founder-1';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/capabilities', capabilitiesRouter);
  return app;
}

function authorizeFounder() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: FOUNDER_USER_ID, email: FOUNDER_EMAIL, email_confirmed_at: '2026-11-15T00:00:00Z' } },
    error: null,
  });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return boundFounderRow(FOUNDER_EMAIL, FOUNDER_USER_ID);
    throw new Error(`Unexpected table: ${table}`);
  });
}

function graphicRequest(referenceAssetIds: string[] = []) {
  return {
    request: {
      requestId: 'media-request-1',
      correlationId: 'corr-1',
      workspaceId: 'workspace-1',
      projectId: 'founder-control-room',
      requestedBy: 'founder-1',
      type: 'post',
      intent: 'compose',
      goal: 'production',
      prompt: 'Render a graphic title card.',
      referenceAssetIds,
      referencePolicy: {
        maySendToExternalProvider: false,
        mayStoreInLibrary: true,
        mayReuseCrossProject: false,
      },
      output: { aspectRatio: '16:9', width: 320, height: 180, durationSeconds: 2, fps: 24 },
      constraints: { needsTextAccuracy: true },
      budget: { mode: 'free', maxCostUsd: 0.1, allowWrapper: false, requireDirectProviderWhenAvailable: true },
      authority: { action: 'media.generate' },
    },
    timeline: {
      width: 320,
      height: 180,
      fps: 24,
      segments: [
        {
          durationSec: 2,
          background: '#101018',
          lines: [{ text: 'FCR render', sizeFrac: 0.08, yFrac: 0.5, color: '#FFFFFF', bold: true }],
        },
      ],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authorizeFounder();
  mockReadEffectiveDesiredState.mockResolvedValue('on');
});

describe('video graphic render capability route', () => {
  it('is discoverable on the existing founder capability surface', async () => {
    const res = await request(buildApp())
      .get('/capabilities')
      .set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.body.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'video-graphic-render-v1',
        runtime: 'dynamic',
      }),
    ]));
  });

  it('fails closed at the founder switch before dispatch execution', async () => {
    mockReadEffectiveDesiredState.mockResolvedValue('off');

    const res = await request(buildApp())
      .post('/capabilities/video-graphic-render-v1/runs')
      .set('Authorization', BEARER)
      .send(graphicRequest());

    expect(res.status).toBe(423);
    expect(res.body).toMatchObject({
      error: 'founder_switch_off',
      switchId: 'fcr-privileged-execution-master',
      desiredState: 'off',
    });
  });

  it('preserves storyboard/source-image continuity by rejecting reference-backed requests before provider dispatch', async () => {
    const res = await request(buildApp())
      .post('/capabilities/video-graphic-render-v1/runs')
      .set('Authorization', BEARER)
      .send(graphicRequest(['opening-frame-1']));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_remote_graphic_request');
    expect(res.body.error).toMatch(/does not transport source\/reference assets/);
  });
});
