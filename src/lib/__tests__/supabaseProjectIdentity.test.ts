import { describe, expect, it } from 'vitest';
import {
  CONTROL_ROOM_SUPABASE_PROJECT_REF,
  validateControlRoomSupabaseUrl,
} from '../supabaseProjectIdentity.js';

const CONTROL_ROOM_URL = `https://${CONTROL_ROOM_SUPABASE_PROJECT_REF}.supabase.co`;

describe('validateControlRoomSupabaseUrl', () => {
  it('accepts the exact Founder Control Room Supabase project', () => {
    const result = validateControlRoomSupabaseUrl(CONTROL_ROOM_URL, {
      nodeEnv: 'production',
    });

    expect(result.origin).toBe(CONTROL_ROOM_URL);
  });

  it('accepts a trailing slash on the project origin', () => {
    const result = validateControlRoomSupabaseUrl(`${CONTROL_ROOM_URL}/`, {
      nodeEnv: 'production',
    });

    expect(result.origin).toBe(CONTROL_ROOM_URL);
  });

  it('rejects a different Supabase project ref', () => {
    expect(() =>
      validateControlRoomSupabaseUrl('https://abcdefghijklmnopqrst.supabase.co', {
        nodeEnv: 'production',
      }),
    ).toThrow('does not match the Founder Control Room project ref');
  });

  it('rejects a cloud URL that does not use HTTPS', () => {
    expect(() =>
      validateControlRoomSupabaseUrl(
        `http://${CONTROL_ROOM_SUPABASE_PROJECT_REF}.supabase.co`,
        { nodeEnv: 'production' },
      ),
    ).toThrow('must use HTTPS');
  });

  it('rejects custom cloud ports', () => {
    expect(() =>
      validateControlRoomSupabaseUrl(`${CONTROL_ROOM_URL}:8443`, {
        nodeEnv: 'production',
      }),
    ).toThrow('must not specify a custom port');
  });

  it('rejects embedded credentials', () => {
    expect(() =>
      validateControlRoomSupabaseUrl(
        `https://user:password@${CONTROL_ROOM_SUPABASE_PROJECT_REF}.supabase.co`,
        { nodeEnv: 'production' },
      ),
    ).toThrow('must not contain embedded credentials');
  });

  it('rejects nested paths, query parameters, and fragments', () => {
    expect(() =>
      validateControlRoomSupabaseUrl(`${CONTROL_ROOM_URL}/rest/v1`, {
        nodeEnv: 'production',
      }),
    ).toThrow('must point to the project origin');

    expect(() =>
      validateControlRoomSupabaseUrl(`${CONTROL_ROOM_URL}?debug=true`, {
        nodeEnv: 'production',
      }),
    ).toThrow('must not contain query parameters or a fragment');

    expect(() =>
      validateControlRoomSupabaseUrl(`${CONTROL_ROOM_URL}#debug`, {
        nodeEnv: 'production',
      }),
    ).toThrow('must not contain query parameters or a fragment');
  });

  it('rejects malformed URLs', () => {
    expect(() =>
      validateControlRoomSupabaseUrl('not-a-url', { nodeEnv: 'production' }),
    ).toThrow('must be a valid absolute URL');
  });

  it('allows local Supabase only with an explicit non-production opt-in', () => {
    const result = validateControlRoomSupabaseUrl('http://127.0.0.1:54321', {
      nodeEnv: 'test',
      allowLocal: true,
    });

    expect(result.origin).toBe('http://127.0.0.1:54321');
  });

  it('rejects local Supabase without the explicit opt-in', () => {
    expect(() =>
      validateControlRoomSupabaseUrl('http://localhost:54321', {
        nodeEnv: 'development',
      }),
    ).toThrow('requires SUPABASE_ALLOW_LOCAL=true');
  });

  it('rejects local Supabase in production even with the opt-in flag', () => {
    expect(() =>
      validateControlRoomSupabaseUrl('http://localhost:54321', {
        nodeEnv: 'production',
        allowLocal: true,
      }),
    ).toThrow('requires SUPABASE_ALLOW_LOCAL=true outside production');
  });

  it('treats an unknown environment as production', () => {
    expect(() =>
      validateControlRoomSupabaseUrl('http://localhost:54321', {
        allowLocal: true,
      }),
    ).toThrow('requires SUPABASE_ALLOW_LOCAL=true outside production');
  });
});
