// Node ESM loader hook: resolves every other import normally, but redirects
// provider-facing client modules to hermetic in-memory E2E fakes.
// Registered via `node --import ./e2e/register-loader.mjs dist/index.js`.
// Production source modules are never modified; this changes only what a
// specific import specifier resolves to inside this one harness process.
import { pathToFileURL } from 'node:url';

const FAKE_CLIENT_URL = pathToFileURL(new URL('./fakeSupabaseClient.mjs', import.meta.url).pathname).href;
const PUBLIC_WORKSPACE_CLIENT_URL = pathToFileURL(new URL('./fakePublicWorkspaceSupabaseClient.mjs', import.meta.url).pathname).href;
const FAKE_AUTH_CLIENT_URL = pathToFileURL(new URL('./fakeSupabaseAuthClient.mjs', import.meta.url).pathname).href;
const FAKE_CHIEF_RECOMMENDATION_URL = pathToFileURL(new URL('./fakeChiefControlRoomRecommendation.mjs', import.meta.url).pathname).href;

export async function resolve(specifier, context, nextResolve) {
  const result = await nextResolve(specifier, context);
  if (result.url.endsWith('/lib/supabaseClient.js')) {
    return {
      url: process.env.E2E_PUBLIC_WORKSPACE === '1' ? PUBLIC_WORKSPACE_CLIENT_URL : FAKE_CLIENT_URL,
      shortCircuit: true,
    };
  }
  if (result.url.endsWith('/lib/supabaseAuthClient.js')) {
    return { url: FAKE_AUTH_CLIENT_URL, shortCircuit: true };
  }
  if (
    result.url.endsWith('/lib/chiefControlRoomRecommendation.js')
    && process.env.E2E_REAL_CHIEF !== '1'
  ) {
    return { url: FAKE_CHIEF_RECOMMENDATION_URL, shortCircuit: true };
  }
  return result;
}
