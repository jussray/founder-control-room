import { readFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const manifest = await readFile(new URL('wrangler.email.toml', ROOT), 'utf8');
const parser = await readFile(
  new URL('src/founderSignalEmailIngress/email.ts', ROOT),
  'utf8',
);

const failures = [];
const fail = message => failures.push(message);

if (!/^name\s*=\s*"founder-control-room-review-email"\s*$/m.test(manifest)) {
  fail('email Worker must target founder-control-room-review-email');
}

if (!/^main\s*=\s*"src\/worker\/founderSignalReviewEmail\.ts"\s*$/m.test(manifest)) {
  fail('email Worker must use the canonical founder review email entrypoint');
}

if (/^addresses\s*=/m.test(manifest)) {
  fail('wrangler.email.toml must not claim inbound Email Routing with an unsupported addresses field');
}

if (/\[\[routes\]\]/.test(manifest)) {
  fail('founder review email Worker must not expose an HTTP route');
}

if (!/^workers_dev\s*=\s*false\s*$/m.test(manifest)) {
  fail('founder review email Worker must not expose workers.dev');
}

if (!/^preview_urls\s*=\s*false\s*$/m.test(manifest)) {
  fail('founder review email Worker must keep preview URLs disabled');
}

if (!/binding\s*=\s*"FOUNDER_CONTROL_ROOM_API"/.test(manifest)
  || !/service\s*=\s*"founder-control-room"/.test(manifest)) {
  fail('email Worker must reach FCR through the canonical private service binding');
}

if (!/FOUNDER_REVIEW_EMAIL_DOMAIN\s*=\s*"foundercontrolroom\.org"/.test(manifest)) {
  fail('email routing domain must remain foundercontrolroom.org');
}

if (!/options\.recipientPrefix\s*\?\?\s*'review'/.test(parser)) {
  fail('email parser must preserve the review+<context> recipient prefix contract');
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`Founder review email routing verification failed: ${failure}`);
  }
  process.exit(1);
}

console.log(
  'Founder review email Worker source contract verified: canonical identity, no HTTP exposure, private FCR service binding, and review+context parsing retained. Provider-side review@ routing remains external evidence and is not claimed by Wrangler config.',
);
