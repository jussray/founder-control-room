import { rateLimit } from 'express-rate-limit';

/**
 * Both POST /mcp and POST /mcp/read must share this single in-process
 * per-IP bucket, before bearer-token handling and project-scope decisions.
 * FCR's 120/min global request baseline remains a separate outer gate.
 */
export const rateLimitExternalMcp = rateLimit({
  windowMs: 60 * 1_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many MCP requests. Please retry shortly.' },
});
