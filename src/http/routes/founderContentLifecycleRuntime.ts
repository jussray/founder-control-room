import { configuredPostizMcpLifecycleAdapters } from '../../lib/postizMcpLifecycleAdapter.js';
import { createFounderContentLifecycleRouter } from './founderContentLifecycle.js';

/**
 * Runtime composition root for Founder Content lifecycle provider adapters.
 *
 * The base router remains dependency-injectable for tests. Production/runtime
 * wiring happens here so a provider credential can enable bounded readback
 * without changing publication authority or making tests depend on live SaaS.
 */
export const founderContentLifecycleRouter = createFounderContentLifecycleRouter({
  providerAdapters: configuredPostizMcpLifecycleAdapters(),
});
