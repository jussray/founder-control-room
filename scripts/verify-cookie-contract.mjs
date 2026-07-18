import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(root, '.security/cookies.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const registry = JSON.parse(await readFile(resolve(root, 'config/portfolio-cookie-registry.json'), 'utf8'));
const sessionSource = await readFile(resolve(root, 'src/auth/founderSession.ts'), 'utf8');
const csrfSource = await readFile(resolve(root, 'src/http/middleware/csrf.ts'), 'utf8');
const serverSource = await readFile(resolve(root, 'src/http/server.ts'), 'utf8');
const errors = [];

function requireValue(condition, message) {
  if (!condition) errors.push(message);
}

requireValue(manifest.schemaVersion === 1, 'schemaVersion must be 1');
requireValue(typeof manifest.repository === 'string' && manifest.repository.includes('/'), 'repository must be owner/name');
requireValue(manifest.defaultPolicy === 'deny-undeclared', 'defaultPolicy must be deny-undeclared');
requireValue(Array.isArray(manifest.cookies), 'cookies must be an array');
requireValue(Array.isArray(manifest.scanRoots), 'scanRoots must be an array');
requireValue(Array.isArray(manifest.allowedCookieWriters), 'allowedCookieWriters must be an array');

const names = new Set();
for (const cookie of manifest.cookies ?? []) {
  requireValue(typeof cookie.name === 'string' && /^[A-Za-z0-9_-]+$/.test(cookie.name), 'cookie name is invalid');
  requireValue(!names.has(cookie.name), `duplicate cookie declaration: ${cookie.name}`);
  names.add(cookie.name);
  requireValue(typeof cookie.purpose === 'string' && cookie.purpose.length > 8, `${cookie.name}: purpose is required`);
  requireValue(cookie.path === '/', `${cookie.name}: Path must be / unless a narrower path is explicitly reviewed`);
  requireValue(['strict', 'lax'].includes(cookie.sameSite), `${cookie.name}: SameSite must be strict or lax`);
  requireValue(['always', 'production'].includes(cookie.secure), `${cookie.name}: Secure policy must be always or production`);
  requireValue(Number.isInteger(cookie.maxAgeSeconds) && cookie.maxAgeSeconds <= 30 * 24 * 60 * 60, `${cookie.name}: max age exceeds 30 days`);
  requireValue(typeof cookie.deletion === 'string' && cookie.deletion.length > 4, `${cookie.name}: deletion path is required`);

  if (cookie.sensitive) {
    requireValue(cookie.httpOnly === true, `${cookie.name}: sensitive cookies must be HttpOnly`);
    requireValue(String(cookie.cacheControl).includes('no-store'), `${cookie.name}: sensitive cookie responses must be no-store`);
    requireValue(typeof cookie.csrf === 'string' && cookie.csrf.length > 8, `${cookie.name}: CSRF boundary is required`);
  }
}

requireValue(names.size === 2, 'Founder Control Room must declare exactly two environment names for one logical session');
requireValue(names.has('__Host-fcr_session'), 'production __Host-fcr_session declaration missing');
requireValue(names.has('fcr_session'), 'localhost fcr_session declaration missing');
requireValue(manifest.allowedCookieWriters.length === 1, 'exactly one cookie writer is allowed');
requireValue(manifest.allowedCookieWriters[0] === 'src/auth/founderSession.ts', 'founderSession.ts must remain the only cookie writer');

requireValue(registry.schemaVersion === 1, 'portfolio registry schemaVersion must be 1');
requireValue(registry.repositories?.length === 7, 'portfolio registry must cover exactly seven active repositories');
requireValue(new Set(registry.repositories.map((entry) => entry.repository)).size === 7, 'portfolio repositories must be unique');
requireValue(registry.rules?.nonessentialCookiesEnabled === false, 'nonessential cookies must remain disabled');
requireValue(registry.rules?.trackingCookiesAllowed === false, 'tracking cookies must remain forbidden');
requireValue(registry.rules?.consentCookieRequired === false, 'do not create consent-cookie theater without nonessential cookies');

for (const fragment of [
  "'__Host-fcr_session'",
  "'fcr_session'",
  'HttpOnly',
  'SameSite=Strict',
  'Priority=High',
  "'Cache-Control', 'private, no-store'",
]) {
  requireValue(sessionSource.includes(fragment), `founder session source missing ${fragment}`);
}
for (const fragment of ['requireSameOriginBrowserMutation', "fetchSite !== 'same-origin'", 'origin !== FOUNDER_API_URL']) {
  requireValue(csrfSource.includes(fragment), `canonical CSRF boundary missing ${fragment}`);
}
requireValue(serverSource.includes('app.use(requireSameOriginBrowserMutation)'), 'server must mount the canonical CSRF boundary');
requireValue(!serverSource.includes('requireSameOriginForCookieMutation'), 'duplicate cookie-only mutation guard must not be mounted');

const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.wrangler', '.react-router']);
const sourceExtensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.html']);
const writerPatterns = [
  /document\.cookie\s*=/,
  /setHeader\(\s*['"]Set-Cookie['"]/,
  /headers\.append\(\s*['"]Set-Cookie['"]/,
  /createCookieSessionStorage\s*</,
  /serializeCookieHeader\s*\(/,
  /\bsetCookie\s*\(/,
];

function extension(path) {
  const index = path.lastIndexOf('.');
  return index >= 0 ? path.slice(index) : '';
}

async function walk(path) {
  const info = await stat(path);
  if (info.isDirectory()) {
    if (ignoredDirectories.has(path.split('/').at(-1))) return [];
    const children = await readdir(path);
    return (await Promise.all(children.map((child) => walk(resolve(path, child))))).flat();
  }
  return sourceExtensions.has(extension(path)) ? [path] : [];
}

const allowed = new Set((manifest.allowedCookieWriters ?? []).map((path) => path.replaceAll('\\', '/')));
for (const declared of allowed) {
  try {
    await stat(resolve(root, declared));
  } catch {
    errors.push(`declared cookie writer does not exist: ${declared}`);
  }
}

for (const scanRoot of manifest.scanRoots ?? []) {
  const absolute = resolve(root, scanRoot);
  let files = [];
  try {
    files = await walk(absolute);
  } catch {
    errors.push(`scan root does not exist: ${scanRoot}`);
    continue;
  }

  for (const file of files) {
    const repoPath = relative(root, file).replaceAll('\\', '/');
    if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(repoPath) || repoPath.includes('/__tests__/')) continue;
    const source = await readFile(file, 'utf8');
    if (writerPatterns.some((pattern) => pattern.test(source)) && !allowed.has(repoPath)) {
      errors.push(`undeclared cookie writer: ${repoPath}`);
    }
  }
}

if ((manifest.cookies ?? []).length === 0 && allowed.size > 0) {
  errors.push('cookie-free repositories cannot declare cookie writers');
}

if (errors.length) {
  console.error('Cookie contract verification failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Cookie contract verified for ${manifest.repository}.`);
console.log(`Declared environment cookie names: ${(manifest.cookies ?? []).length}`);
console.log(`Allowed cookie writers: ${allowed.size}`);
console.log(`Portfolio repositories covered: ${registry.repositories.length}`);
console.log('Tracking cookies: 0');
