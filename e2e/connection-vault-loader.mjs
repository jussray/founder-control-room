import { pathToFileURL } from 'node:url';

const FAKE_CLIENT_URL = pathToFileURL(new URL('./connection-vault-fake-supabase.mjs', import.meta.url).pathname).href;
const FAKE_AUTH_URL = pathToFileURL(new URL('./connection-vault-fake-auth.mjs', import.meta.url).pathname).href;

export async function resolve(specifier, context, nextResolve) {
  const result = await nextResolve(specifier, context);
  if (result.url.endsWith('/lib/supabaseClient.js')) {
    return { url: FAKE_CLIENT_URL, shortCircuit: true };
  }
  if (result.url.endsWith('/lib/supabaseAuthClient.js')) {
    return { url: FAKE_AUTH_URL, shortCircuit: true };
  }
  return result;
}
