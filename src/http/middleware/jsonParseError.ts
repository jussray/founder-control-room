import type { ErrorRequestHandler } from 'express';

interface JsonParseFailure {
  type?: unknown;
  status?: unknown;
  statusCode?: unknown;
}

function isJsonParseFailure(error: unknown): error is SyntaxError & JsonParseFailure {
  if (!(error instanceof SyntaxError)) return false;

  const failure = error as SyntaxError & JsonParseFailure;
  return failure.type === 'entity.parse.failed'
    && (failure.status === 400 || failure.statusCode === 400);
}

/**
 * Express's JSON parser runs before route handlers. Convert its strict-parser
 * failures into an explicit client error before the generic 500 boundary.
 */
export const jsonParseErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (!isJsonParseFailure(error)) {
    next(error);
    return;
  }

  res.set('Cache-Control', 'no-store');
  res.status(400).json({
    error: 'Request body must be a valid JSON object or array.',
    code: 'INVALID_JSON',
  });
};
