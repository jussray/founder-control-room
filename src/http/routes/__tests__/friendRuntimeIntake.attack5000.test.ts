import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

import express from 'express';
import request from 'supertest';
import { boundFounderRow } from './founderAuthFixture.js';
import {
  createFriendRuntimeIntakeRouter,
  detectSensitiveCategories,
  redactFriendSummary,
} from '../friendRuntimeIntake.js';

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer attack-5000-token';


beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'founder_users') return boundFounderRow(FOUNDER_EMAIL, 'founder-user-1');
    return {};
  });
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-user-1', email: FOUNDER_EMAIL, email_confirmed_at: '2026-11-15T00:00:00Z' } },
    error: null,
  });
});

describe('Friend ATTACK 5000 privacy membrane', () => {
  it('keeps labeled cloud secret assignments local before preflight, reservation, or provider execution', async () => {
    const runFriendRuntime = vi.fn();
    const preflightLiveInference = vi.fn();
    const reserveLiveInference = vi.fn();
    const writeCompletion = vi.fn(async () => 'timeline-attack-5000');

    const app = express();
    app.use(express.json());
    app.use('/mirror/friend-intake', createFriendRuntimeIntakeRouter({
      runFriendRuntime,
      preflightLiveInference,
      reserveLiveInference,
      resolveProjectId: vi.fn(async () => 'project-1'),
      writeCompletion,
      isInteractiveFounderRequest: () => true,
    }));

    for (const transcript of [
      'AWS_SECRET_ACCESS_KEY=fake-secret-value',
      'AWS_SESSION_TOKEN="fake-session-value"',
    ]) {
      const response = await request(app)
        .post('/mirror/friend-intake')
        .set('Authorization', BEARER)
        .send({
          transcript,
          privacyChoice: 'process_without_saving',
          provider: 'openai',
          timeEnergyContext: 'Ten minutes.',
          voiceProfile: null,
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        runtimeProvider: 'deterministic',
        modelExecutionState: 'not_used',
        move: { kind: 'protective_move' },
      });
    }

    expect(runFriendRuntime).not.toHaveBeenCalled();
    expect(preflightLiveInference).not.toHaveBeenCalled();
    expect(reserveLiveInference).not.toHaveBeenCalled();
  });

  it('classifies and redacts labeled cloud secret assignments', () => {
    const value = 'AWS_SECRET_ACCESS_KEY=fake-secret-value AWS_SESSION_TOKEN="fake-session-value"';

    expect(detectSensitiveCategories(value)).toContain('credentials');
    expect(redactFriendSummary(value)).toBe(
      'AWS_SECRET_ACCESS_KEY=[redacted-credential] AWS_SESSION_TOKEN=[redacted-credential]',
    );
  });
});
