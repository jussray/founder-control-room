import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/http/routes/debug.ts'), 'utf8');

describe('provider debug authorization membrane', () => {
  it('rate-limits requests before founder authorization', () => {
    expect(source).toContain("import { rateLimitFounderPermissions } from '../middleware/security.js'");
    expect(source).toContain('debugRouter.use(rateLimitFounderPermissions, requireFounder)');
    expect(source.indexOf('rateLimitFounderPermissions')).toBeLessThan(source.indexOf("debugRouter.get('/provider'"));
  });

  it('keeps provider inspection private and non-secret', () => {
    expect(source).toContain("res.setHeader('Cache-Control', 'private, no-store')");
    expect(source).not.toMatch(/res\.json\([^)]*(OPENAI_API_KEY|PERPLEXITY_API_KEY)/s);
  });
});
