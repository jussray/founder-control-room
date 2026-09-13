import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({ supabaseAuth: { auth: { getUser: mockGetUser } } }));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

import express from 'express';
import request from 'supertest';
import { createQuickScanRouter } from '../quickscan.js';
import { resetQuickScanStoreForTests } from '../../../quickscan/store.js';

const BEARER = 'Bearer test-token';
const FOUNDER_EMAIL = 'founder@example.com';

function founderSession() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-1', email: FOUNDER_EMAIL } },
    error: null,
  });
}

function founderUsersRow() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: { email: FOUNDER_EMAIL }, error: null }),
      }),
    }),
  };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/quickscan', createQuickScanRouter());
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetQuickScanStoreForTests();
  supabaseMock.from.mockImplementation((table: string) => table === 'founder_users' ? founderUsersRow() : {});
});

describe('QuickScan model provider configuration truth', () => {
  it('reports Anthropic configured only when both its key and explicit model exist', async () => {
    const snapshot = {
      provider: process.env.QUICKSCAN_CHIEF_PROVIDER,
      openaiKey: process.env.OPENAI_API_KEY,
      anthropicKey: process.env.ANTHROPIC_API_KEY,
      anthropicModel: process.env.QUICKSCAN_CHIEF_ANTHROPIC_MODEL,
    };

    try {
      process.env.QUICKSCAN_CHIEF_PROVIDER = 'anthropic';
      delete process.env.OPENAI_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'anthropic-test-secret';
      delete process.env.QUICKSCAN_CHIEF_ANTHROPIC_MODEL;
      founderSession();

      let response = await request(buildApp()).get('/quickscan').set('Authorization', BEARER);
      expect(response.status).toBe(200);
      expect(response.body.authority.chiefConfigured).toBe(false);

      process.env.QUICKSCAN_CHIEF_ANTHROPIC_MODEL = 'claude-test';
      response = await request(buildApp()).get('/quickscan').set('Authorization', BEARER);
      expect(response.body.authority.chiefConfigured).toBe(true);
      expect(JSON.stringify(response.body)).not.toContain('anthropic-test-secret');
      expect(JSON.stringify(response.body)).not.toContain('claude-test');
    } finally {
      if (snapshot.provider === undefined) delete process.env.QUICKSCAN_CHIEF_PROVIDER;
      else process.env.QUICKSCAN_CHIEF_PROVIDER = snapshot.provider;
      if (snapshot.openaiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = snapshot.openaiKey;
      if (snapshot.anthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = snapshot.anthropicKey;
      if (snapshot.anthropicModel === undefined) delete process.env.QUICKSCAN_CHIEF_ANTHROPIC_MODEL;
      else process.env.QUICKSCAN_CHIEF_ANTHROPIC_MODEL = snapshot.anthropicModel;
    }
  });

  it('keeps OpenAI as the backward-compatible default provider', async () => {
    const snapshot = {
      provider: process.env.QUICKSCAN_CHIEF_PROVIDER,
      openaiKey: process.env.OPENAI_API_KEY,
    };

    try {
      delete process.env.QUICKSCAN_CHIEF_PROVIDER;
      process.env.OPENAI_API_KEY = 'openai-test-secret';
      founderSession();

      const response = await request(buildApp()).get('/quickscan').set('Authorization', BEARER);
      expect(response.body.authority.chiefConfigured).toBe(true);
      expect(JSON.stringify(response.body)).not.toContain('openai-test-secret');
    } finally {
      if (snapshot.provider === undefined) delete process.env.QUICKSCAN_CHIEF_PROVIDER;
      else process.env.QUICKSCAN_CHIEF_PROVIDER = snapshot.provider;
      if (snapshot.openaiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = snapshot.openaiKey;
    }
  });
});
