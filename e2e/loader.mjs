// Node ESM loader hook: resolves every other import normally, but redirects
// the two Supabase client modules to the in-memory fakes in this directory.
// Registered via `node --import ./e2e/register-loader.mjs dist/index.js`.
// src/lib/supabaseClient.ts and supabaseAuthClient.ts are never modified —
// this only changes what a specific import specifier resolves to at
// runtime, for this one harness process.
import { pathToFileURL } from 'node:url';

const FAKE_CLIENT_URL = pathToFileURL(new URL('./fakeSupabaseClient.mjs', import.meta.url).pathname).href;
const FAKE_AUTH_CLIENT_URL = pathToFileURL(new URL('./fakeSupabaseAuthClient.mjs', import.meta.url).pathname).href;

export async function resolve(specifier, context, nextResolve) {
  const result = await nextResolve(specifier, context);
  if (result.url.endsWith('/lib/supabaseClient.js')) {
    return { url: FAKE_CLIENT_URL, shortCircuit: true };
  }
  if (result.url.endsWith('/lib/supabaseAuthClient.js')) {
    return { url: FAKE_AUTH_CLIENT_URL, shortCircuit: true };
  }
  return result;
}
