import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const securityPath = path.resolve(process.cwd(), 'src/http/middleware/security.ts');
const serverPath = path.resolve(process.cwd(), 'src/http/server.ts');

describe('HTTP rate-limit baseline contract', () => {
  it('applies the general limiter from the earliest shared request middleware', () => {
    const source = fs.readFileSync(securityPath, 'utf8');
    expect(source).toContain('rateLimitGeneral(req, res, next);');
    expect(source).toContain('const generalRateLimitCore = createRateLimiter(');
    expect(source).toMatch(
      /export const rateLimitGeneral: RequestHandler = \(req, res, next\): void => \{[\s\S]*?generalRateLimitCore\(req,\s*res,\s*next\);[\s\S]*?\n\};/,
    );
  });

  it('sets a 120 requests/minute broad baseline while preserving stricter local limiters', () => {
    const source = fs.readFileSync(securityPath, 'utf8');
    expect(source).toMatch(/generalRateLimitCore = createRateLimiter\(\s*60 \* 1_000,\s*120,/s);
    expect(source).toContain('export const rateLimitMagicLink = createRateLimiter(');
    expect(source).toContain('export const rateLimitFounderPermissions = rateLimit({');
  });


  it('keeps the recognized baseline between request audit and all signed ingress routes', () => {
    const source = fs.readFileSync(serverPath, 'utf8');
    const audit = source.indexOf('app.use(requestAudit);');
    const recognizedLimiter = source.indexOf('app.use(rateLimit({', audit);
    const githubWebhook = source.indexOf("'/webhooks/github'", recognizedLimiter);
    const browserMutationGate = source.indexOf('app.use(requireSameOriginBrowserMutation);', recognizedLimiter);
    const workspaceMount = source.indexOf("app.use('/workspace', workspaceProjectsRouter);", recognizedLimiter);

    expect(audit).toBeGreaterThan(-1);
    expect(recognizedLimiter).toBeGreaterThan(audit);
    expect(githubWebhook).toBeGreaterThan(recognizedLimiter);
    expect(browserMutationGate).toBeGreaterThan(recognizedLimiter);
    expect(workspaceMount).toBeGreaterThan(browserMutationGate);
    expect(source.slice(recognizedLimiter, githubWebhook)).toMatch(
      /windowMs:\s*60 \* 1_000,\s*limit:\s*120,/,
    );
  });

  it('counts each Express request at most once even when routes reuse the limiter', () => {
    const source = fs.readFileSync(securityPath, 'utf8');
    expect(source).toContain('const generalRateLimitedRequests = new WeakSet<Request>();');
    expect(source).toContain('if (generalRateLimitedRequests.has(req))');
    expect(source).toContain('generalRateLimitedRequests.add(req);');
  });
});
