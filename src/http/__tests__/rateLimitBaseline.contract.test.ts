import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const securityPath = path.resolve(process.cwd(), 'src/http/middleware/security.ts');

describe('HTTP rate-limit baseline contract', () => {
  it('applies the general limiter from the earliest shared request middleware', () => {
    const source = fs.readFileSync(securityPath, 'utf8');
    expect(source).toContain('rateLimitGeneral(req, res, next);');
    expect(source).toContain('const generalRateLimitCore = createRateLimiter(');
  });

  it('counts each Express request at most once even when routes reuse the limiter', () => {
    const source = fs.readFileSync(securityPath, 'utf8');
    expect(source).toContain('const generalRateLimitedRequests = new WeakSet<Request>();');
    expect(source).toContain('if (generalRateLimitedRequests.has(req))');
    expect(source).toContain('generalRateLimitedRequests.add(req);');
  });
});
