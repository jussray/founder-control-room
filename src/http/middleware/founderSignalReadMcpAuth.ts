import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

type JsonRecord = Record<string, unknown>;

export interface FounderSignalReadMcpAuthDependencies {
  env?: NodeJS.ProcessEnv;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function rpcId(value: unknown): string | number | null {
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

function secureEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  return token.length > 0 && token.length <= 4096 ? token : null;
}

function rpcError(id: string | number | null, code: number, message: string): JsonRecord {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

export function createFounderSignalReadMcpAuth(
  overrides: FounderSignalReadMcpAuthDependencies = {},
): RequestHandler {
  const env = overrides.env ?? process.env;

  return (req, res, next) => {
    const body = isRecord(req.body) ? req.body : null;
    const id = rpcId(body?.id);
    const configuredToken = env.FOUNDER_SIGNAL_READ_MCP_TOKEN?.trim();
    if (!configuredToken) {
      res.status(503).json(
        rpcError(id, -32001, 'Founder Signal read MCP token is not configured'),
      );
      return;
    }

    const token = bearerToken(req.header('authorization'));
    if (!token || !secureEqual(token, configuredToken)) {
      res.status(401).json(rpcError(id, -32000, 'Unauthorized'));
      return;
    }

    next();
  };
}

export const requireFounderSignalReadMcpToken = createFounderSignalReadMcpAuth();
