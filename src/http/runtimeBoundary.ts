let cloudflareWorkerRuntime = false;

/**
 * Mark whether the current process is executing behind the canonical
 * Cloudflare Worker entry point. This is a non-secret runtime fact only; it
 * grants no authority. Cloudflare entry code sets it before importing the
 * Express server so sensitive diagnostics can fail closed without depending
 * on Node process.env compatibility behavior.
 */
export function setCloudflareWorkerRuntime(value: boolean): void {
  cloudflareWorkerRuntime = value;
}

export function requiresFounderForDebugSurface(): boolean {
  return cloudflareWorkerRuntime
    || process.env.ENVIRONMENT === 'production'
    || process.env.NODE_ENV === 'production';
}
