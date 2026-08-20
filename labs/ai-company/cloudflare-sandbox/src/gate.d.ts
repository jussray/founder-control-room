export const NONCE_TTL_MS: number;
export const RATE_WINDOW_MS: number;
export const MAX_REQUESTS_PER_WINDOW: number;

export class SandboxRequestGate {
  constructor(state: DurableObjectState);
  fetch(request: Request): Promise<Response>;
  alarm(): Promise<void>;
}
