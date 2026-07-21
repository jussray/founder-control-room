import { readFile } from 'node:fs/promises';

const files = {
  auth: await readFile(new URL('../src/http/routes/auth.ts', import.meta.url), 'utf8'),
  ui: await readFile(new URL('../src/http/routes/onboarding.ts', import.meta.url), 'utf8'),
  session: await readFile(new URL('../src/auth/founderSession.ts', import.meta.url), 'utf8'),
  middleware: await readFile(new URL('../src/http/middleware/requireFounder.ts', import.meta.url), 'utf8'),
  server: await readFile(new URL('../src/http/server.ts', import.meta.url), 'utf8'),
  worker: await readFile(new URL('../src/worker/cf-entry.ts', import.meta.url), 'utf8'),
  workerHandler: await readFile(new URL('../src/worker/handler.ts', import.meta.url), 'utf8'),
  wrangler: await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8'),
};

const errors = [];
const requireText = (file, label, text) => {
  if (!files[file].includes(text)) errors.push(`${label}: missing ${JSON.stringify(text)}`);
};

requireText('auth', 'allowlist gate', "from('founder_users')");
requireText('auth', 'first-login identity creation', 'shouldCreateUser: true');
requireText('auth', 'session endpoint', "authRouter.post('/session'");
requireText('auth', 'session cookie write', 'writeFounderSession(res, data.session)');
requireText('auth', 'generic enumeration-safe response', 'GENERIC_MAGIC_LINK_MESSAGE');
requireText('auth', 'password handoff endpoint', "authRouter.post('/password'");
requireText('auth', 'password handoff auth gate', "authRouter.post('/password', requireFounder");
requireText('auth', 'password handoff cookie gate', 'readFounderSession(req)');
requireText('auth', 'password handoff Supabase update', 'auth.updateUser({ password })');
requireText('auth', 'password minimum', 'MIN_FOUNDER_PASSWORD_LENGTH = 12');
requireText('auth', 'fragment handoff construction', 'new URLSearchParams');
requireText('auth', 'fragment handoff redirect', "setHeader('Location', `/control-room/#${fragment.toString()}`)");
requireText('ui', 'password form', 'id="password-form"');
requireText('ui', 'password confirmation', 'name="confirmPassword"');
requireText('ui', 'password endpoint fetch', "fetch('/auth/password'");
requireText('session', 'HttpOnly cookie', 'HttpOnly');
requireText('session', 'strict same-site cookie', 'SameSite=Strict');
requireText('session', 'HTTPS-aware Secure cookie', "startsWith('https://')");
requireText('session', 'private no-store session response', "'Cache-Control', 'private, no-store'");
requireText('middleware', 'Bearer compatibility', 'bearerToken(req)');
requireText('middleware', 'browser cookie auth', 'readFounderSession(req)');
requireText('middleware', 'server refresh', 'refreshSession');
requireText('server', 'security headers', 'helmetMiddleware');
requireText('server', 'CSP', 'onboardingContentSecurityPolicy');
requireText('server', 'same-origin browser mutation gate', 'requireSameOriginBrowserMutation');
requireText('server', 'onboarding route', "app.use('/', onboardingRouter)");
requireText('server', 'auth route', "app.use('/auth', authRouter)");
requireText('worker', 'current Cloudflare Node HTTP adapter', 'httpServerHandler');
requireText('worker', 'current Worker composition', 'composeWorkerHandler');
requireText('worker', 'current runtime validation', 'validateWorkerEnv(env)');
requireText('workerHandler', 'runtime validation helper', 'validateWorkerEnv');
requireText('workerHandler', 'scheduled reconciler composition', 'composeWorkerHandler');
requireText('wrangler', 'Node HTTP compatibility flag', 'enable_nodejs_http_server_modules');

if (files.ui.includes('sekretbip@gmail.com')) {
  errors.push('privacy: founder email must not be embedded in browser assets');
}
if (/json\([^)]*access_token\s*:\s*data\.session\.access_token/s.test(files.auth)) {
  errors.push('token handling: raw access tokens must not be returned as callback JSON');
}
if (files.auth.includes('SUPABASE_SERVICE_ROLE_KEY')) {
  errors.push('key boundary: auth route must not reference the service-role key');
}
if (/console\.(log|error|warn)\([^)]*password/i.test(files.auth + files.ui)) {
  errors.push('password handling: password values must not be logged');
}
if (files.worker.includes('Object.assign(request')) {
  errors.push('Worker bridge: hand-built Request duck typing must not return');
}
if (files.worker.includes('handleAsNodeRequest')) {
  errors.push('Worker bridge: stale handleAsNodeRequest path must not replace current httpServerHandler composition');
}

if (errors.length) {
  console.error('Founder onboarding contract failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Founder onboarding contract verified.');
console.log('Founder email embedded in UI: no');
console.log('Raw token callback JSON: no');
console.log('Auth service-role reference: no');
console.log('Founder cookie: HttpOnly, SameSite=Strict, HTTPS-aware Secure, private/no-store');
console.log('Founder password handoff: authenticated cookie-only updateUser flow');
console.log('Worker bridge: current Cloudflare httpServerHandler composition preserved');