export interface SandboxInvocation {
  method: 'POST';
  pathname: '/v1/synthetic-evidence';
  subject: string;
  nonce: string;
  issuedAt: number;
}

export type AuthenticationResult =
  | { ok: true; invocation: SandboxInvocation }
  | { ok: false; code: string };

export const EXECUTION_PATH: '/v1/synthetic-evidence';
export const MAX_CLOCK_SKEW_MS: number;
export const MIN_SHARED_SECRET_LENGTH: number;
export function canonicalInvocation(invocation: SandboxInvocation): string;
export function signInvocation(secret: string, invocation: SandboxInvocation): Promise<string>;
export function deriveSandboxSessionId(invocation: SandboxInvocation): Promise<string>;
export function deriveSubjectGateId(subject: string): Promise<string>;
export function authenticateInvocation(
  request: Request,
  secret: string | undefined,
  now?: number,
): Promise<AuthenticationResult>;
