import type { RequestHandler } from 'express';

/**
 * The onboarding UI is entirely same-origin and contains no inline JavaScript.
 * Keep the policy explicit so a future asset or analytics addition cannot
 * silently widen the founder login surface.
 */
export const onboardingContentSecurityPolicy: RequestHandler = (_req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "connect-src 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join('; '),
  );
  next();
};
