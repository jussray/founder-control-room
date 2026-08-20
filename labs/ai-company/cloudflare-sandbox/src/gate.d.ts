export const NONCE_TTL_MS: number;
export const RATE_WINDOW_MS: number;
export const LAST_ACCEPTED_AT_KEY: string;

export class SandboxRequestGate {
  constructor(state: DurableObjectState);
  fetch(request: Request): Promise<Response>;
  alarm(): Promise<void>;
}
