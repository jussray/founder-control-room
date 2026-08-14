import type { Response } from 'express';

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta: Record<string, unknown>;
}

export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
    details: unknown[];
  };
}

export function respondSuccess<T>(
  res: Response,
  data: T,
  status = 200,
  meta: Record<string, unknown> = {},
) {
  const payload: ApiSuccess<T> = {
    success: true,
    data,
    meta,
  };

  return res.status(status).json(payload);
}

export function respondError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details: unknown[] = [],
) {
  const payload: ApiFailure = {
    success: false,
    error: {
      code,
      message,
      details,
    },
  };

  return res.status(status).json(payload);
}
