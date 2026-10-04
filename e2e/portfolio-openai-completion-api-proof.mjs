// Local API fault-injection proof. No live provider, credential, deploy, or UI claim.
// Requires sibling solcontinuity (built) and promptos checkouts, or explicit paths.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {request as playwrightRequest} from 'playwright';

const solRoot = process.env.SOL_PROOF_ROOT || fileURLToPath(new URL('../../solcontinuity/', import.meta.url));
const promptosRoot = process.env.PROMPTOS_PROOF_ROOT || fileURLToPath(new URL('../../promptos/', import.meta.url));
const {createSolContinuityServer} = await import(pathToFileURL(`${solRoot}/dist/src/api/server.js`));
const {default: promptosWorker} = await import(pathToFileURL(`${promptosRoot}/cloudflare-worker/analytics.js`));
const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;
let providerStatus = 'completed';
let calls = 0;
globalThis.fetch = async (url, init) => {
  if (String(url) !== 'https://api.openai.com/v1/responses') return originalFetch(url, init);
  calls += 1;
  return Response.json({id: 'resp_fault_injection', status: providerStatus,
    output_text: 'synthetic answer', error: {message: 'private-provider-detail'}});
};
process.env.OPENAI_API_KEY = 'synthetic-test-key';
const sol = createSolContinuityServer({consoleToken: 'synthetic-console-token', rateLimit: {capacity: 1000}});
const promptos = createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const response = await promptosWorker.fetch(new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method, headers: req.headers,
      ...(body.length ? {body} : {}),
    }), {PROMPTOS_AI_OPERATOR_KEY: 'synthetic-operator-key', OPENAI_API_KEY: 'synthetic-test-key'});
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  } catch {
    res.writeHead(500); res.end('local proof transport failed');
  }
});
const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const close = (server) => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
const contexts = [];
const observations = [];
try {
  await listen(sol); await listen(promptos);
  for (const [project, server, route, headers] of [
    ['solcontinuity', sol, '/api/providers/invoke', {}],
    ['promptos', promptos, '/providers', {authorization: 'Bearer synthetic-operator-key'}],
  ]) {
    const api = await playwrightRequest.newContext({baseURL: `http://127.0.0.1:${server.address().port}`});
    contexts.push(api);
    const unauthorized = await api.post(route, {data: {provider: 'openai', prompt: 'test'}});
    assert.equal(unauthorized.status(), 401);
    assert.equal(calls, 0);
    observations.push({project, case: 'unauthorized', httpStatus: 401, providerCalls: 0});
    if (project === 'solcontinuity') {
      const login = await api.post('/api/session/login', {data: {token: 'synthetic-console-token'}});
      assert.equal(login.status(), 204);
    }
    for (const status of ['completed', 'incomplete', 'failed', 'cancelled', 'queued', 'in_progress', undefined]) {
      providerStatus = status; calls = 0;
      const response = await api.post(route, {headers, data: {provider: 'openai', prompt: 'bounded fault injection'}});
      const body = await response.json();
      const completed = status === 'completed';
      assert.equal(response.status(), completed ? 200 : 503);
      assert.equal(calls, 1, 'provider must not be retried');
      if (completed) {
        assert.equal(body.result.authority, 'none');
        assert.equal(body.result.text, 'synthetic answer');
      } else {
        assert.equal(body.result, undefined, 'partial text must not escape as success');
        assert.equal(body.error, project === 'solcontinuity'
          ? 'OPENAI_NON_COMPLETED_RESPONSE' : 'openai provider returned a non-completed response');
        assert.ok(!JSON.stringify(body).includes('private-provider-detail'));
      }
      observations.push({project, case: status ?? 'missing-status', httpStatus: response.status(), providerCalls: calls});
    }
    calls = 0;
  }
  const sha = (cwd) => execFileSync('git', ['rev-parse', 'HEAD'], {cwd, encoding: 'utf8'}).trim();
  const receipt = {schema: 'juss/openai-completion-api-proof@v1', observedAt: new Date().toISOString(),
    evidenceClass: 'local-api-fault-injection', liveProviderVerified: false, browserUiVerified: false,
    heads: {solcontinuity: sha(solRoot), promptos: sha(promptosRoot)}, passed: observations.length, observations};
  if (process.env.PROOF_OUTPUT_PATH) await writeFile(process.env.PROOF_OUTPUT_PATH, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt));
} finally {
  for (const context of contexts) await context.dispose();
  await close(sol); await close(promptos);
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
}
