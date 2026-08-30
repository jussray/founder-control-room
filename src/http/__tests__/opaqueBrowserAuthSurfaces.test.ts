import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SURFACES = [
  'public/control-room/mission-board.js',
  'public/control-room/futureyou-v8.js',
  'public/control-room/goalfix.js',
] as const;

describe('opaque founder browser auth surfaces', () => {
  it.each(SURFACES)('%s uses the HttpOnly same-origin session instead of a browser bearer', (path) => {
    const source = readFileSync(resolve(process.cwd(), path), 'utf8');
    expect(source).toContain("credentials: 'same-origin'");
    expect(source).not.toContain('Authorization:');
    expect(source).not.toContain('access_token');
    expect(source).not.toContain("sessionStorage.getItem('fcr_session')");
  });
});
