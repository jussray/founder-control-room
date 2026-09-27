import upstream from '../src/worker/cf-entry.js';
import {
  emitReciprocalTelemetry,
  observeFetchRequest,
  syntheticFetchResponse,
} from './reciprocal-ingress.mjs';

export * from '../src/worker/cf-entry.js';

const edge = {
  ...upstream,
  async fetch(request: Request, env: Record<string, unknown>, ctx: { waitUntil?: (promise: Promise<unknown>) => void }) {
    const observation = await observeFetchRequest(request, env, 'founder-control-room');
    emitReciprocalTelemetry(observation, ctx);
    const hallway = syntheticFetchResponse(observation);
    if (hallway) return hallway;
    if (!upstream.fetch) throw new Error('Founder Control Room upstream fetch is unavailable');
    return upstream.fetch.call(upstream, request, env as never, ctx as never);
  },
};

export default edge;
