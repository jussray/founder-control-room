import { createPrivateKey, generateKeyPairSync } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

type Classification = {
  present: boolean;
  transportClass: string;
  recognizedTransport: boolean;
  pemBoundary: boolean;
  parseFailed: boolean;
  rsaParse: boolean;
  diagnostics: string;
};

// Computed specifier: the minting script lives outside the TypeScript program,
// so it is imported at runtime rather than linked into the build graph.
const moduleHref = new URL(
  '../../../scripts/mint-portfolio-github-app-token.mjs',
  import.meta.url,
).href;

let classifyPrivateKey: (secret: unknown) => Classification;

const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
const pkcs8 = rsa.export({ type: 'pkcs8', format: 'pem' }).toString().trim();
const pkcs1 = rsa.export({ type: 'pkcs1', format: 'pem' }).toString().trim();
const derPkcs8 = rsa.export({ type: 'pkcs8', format: 'der' }) as Buffer;
const derPkcs1 = rsa.export({ type: 'pkcs1', format: 'der' }) as Buffer;

beforeAll(async () => {
  ({ classifyPrivateKey } = (await import(moduleHref)) as {
    classifyPrivateKey: (secret: unknown) => Classification;
  });
});

describe('App private-key transport classification', () => {
  it('importing the minting script does not execute its entry point', () => {
    // main() is guarded so the normalizer stays testable without APP_ID present.
    expect(classifyPrivateKey).toBeTypeOf('function');
  });

  // Each row is a paste shape a founder can realistically store in the secret.
  const accepted: Array<[string, () => string, string]> = [
    ['pkcs8 raw PEM', () => pkcs8, 'raw-pem'],
    ['pkcs1 raw PEM', () => pkcs1, 'raw-pem'],
    ['CRLF line endings', () => pkcs8.replace(/\n/g, '\r\n'), 'raw-pem'],
    ['surrounding whitespace', () => `  \n${pkcs8}  \n `, 'raw-pem'],
    ['escaped newlines', () => pkcs8.replace(/\n/g, '\\n'), 'escaped-newline-pem'],
    ['JSON-quoted', () => JSON.stringify(pkcs8), 'json-quoted-pem'],
    ['single-quoted', () => `'${pkcs8}'`, 'single-quoted-pem'],
    ['base64 of PEM', () => Buffer.from(pkcs8).toString('base64'), 'base64-pem'],
    ['base64url of PEM', () => Buffer.from(pkcs8).toString('base64url'), 'base64-pem'],
  ];

  for (const [label, build, expectedClass] of accepted) {
    it(`accepts ${label}`, () => {
      const result = classifyPrivateKey(build());
      expect(result.pemBoundary).toBe(true);
      expect(result.rsaParse).toBe(true);
      expect(result.transportClass).toBe(expectedClass);
    });
  }

  // Regression: these four previously classified as unrecoverable and failed the
  // portfolio evidence sync closed at the minting step.
  const recovered: Array<[string, () => string, string]> = [
    ['base64 of pkcs8 DER', () => derPkcs8.toString('base64'), 'base64-der'],
    ['base64 of pkcs1 DER', () => derPkcs1.toString('base64'), 'base64-der'],
    [
      'PEM body with header lines stripped',
      () => pkcs8.split('\n').slice(1, -1).join('\n'),
      'base64-der',
    ],
    ['PEM newlines collapsed to spaces', () => pkcs8.replace(/\n/g, ' '), 'collapsed-pem'],
  ];

  for (const [label, build, expectedClass] of recovered) {
    it(`recovers ${label}`, () => {
      const result = classifyPrivateKey(build());
      expect(result.pemBoundary).toBe(true);
      expect(result.rsaParse).toBe(true);
      expect(result.transportClass).toBe(expectedClass);
    });
  }

  it('still fails closed on an empty secret', () => {
    const result = classifyPrivateKey('');
    expect(result.present).toBe(false);
    expect(result.transportClass).toBe('empty');
    expect(result.rsaParse).toBe(false);
  });

  it('still fails closed on unrelated text', () => {
    const result = classifyPrivateKey('not a key at all');
    expect(result.pemBoundary).toBe(false);
    expect(result.rsaParse).toBe(false);
  });

  it('still fails closed on a truncated PEM', () => {
    const result = classifyPrivateKey(pkcs8.slice(0, 80));
    expect(result.pemBoundary).toBe(false);
    expect(result.rsaParse).toBe(false);
  });

  it('rejects a well-formed non-RSA key', () => {
    const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' })
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString()
      .trim();
    const result = classifyPrivateKey(ec);
    expect(result.pemBoundary).toBe(true);
    expect(result.rsaParse).toBe(false);
  });

  it('rejects base64 that decodes to neither PEM nor DER', () => {
    const result = classifyPrivateKey(Buffer.from('x'.repeat(200)).toString('base64'));
    expect(result.pemBoundary).toBe(false);
    expect(result.rsaParse).toBe(false);
  });

  it('reports shape facts without emitting any key material', () => {
    const body = pkcs8.split('\n')[1]!;
    const result = classifyPrivateKey(body.slice(0, 50));

    expect(result.diagnostics).toContain('begin=false');
    expect(result.diagnostics).toContain('b64charset=true');
    // Length is reconstructable metadata and must never be emitted.
    expect(result.diagnostics).not.toMatch(/len=|lines=\d/);
    // The whole point of the diagnostic is that it never carries the secret.
    expect(result.diagnostics).not.toContain(body.slice(0, 16));
  });
});

describe('shape diagnostic workflow agrees with minting without importing it', () => {
  const workflow = readFileSync(
    '.github/workflows/github-app-secret-shape-diagnostic.yml',
    'utf8',
  );

  // That job holds the production App private key, so it must never execute
  // repository-checked-out code. The duplicated classifier is the deliberate
  // price of that isolation; these assertions keep the two copies in agreement.
  it('never checks out candidate-controlled code into the production-secret job', () => {
    expect(workflow).not.toContain('actions/checkout');
  });

  it('carries the same recovery branches the minting classifier uses', () => {
    expect(workflow).toContain('function decodeDerToPem(value) {');
    expect(workflow).toContain('function rewrapCollapsedPem(value) {');
    expect(workflow).toContain('function base64Bytes(value) {');
    expect(workflow).toContain("transportClass = 'base64-der';");
    expect(workflow).toContain("transportClass = 'collapsed-pem';");
  });

  it('applies DER recovery before settling the boundary verdict', () => {
    const derIndex = workflow.indexOf('const derPem = decodeDerToPem(normalized);');
    const boundaryIndex = workflow.indexOf('let pemBoundary = /^-----BEGIN');
    expect(derIndex).toBeGreaterThan(-1);
    expect(boundaryIndex).toBeGreaterThan(derIndex);
  });

  it('keeps emitting shape booleans only, with no length or digest metadata', () => {
    expect(workflow).toContain('reconstructableSecretMetadataLogged: false');
    expect(workflow).not.toContain('normalized.length');
    expect(workflow).not.toContain('createHash');
  });
});

describe('isolated workflow classifier matches minting across generated keys', () => {
  it('executes both implementations against accepted and rejected transports', () => {
    const workflow = readFileSync(
      '.github/workflows/github-app-secret-shape-diagnostic.yml',
      'utf8',
    );
    const startMarker = 'function decodeJsonQuotedString(value) {';
    const endMarker = 'const appIdNumeric = /^' + String.fromCharCode(92) + 'd+$/.test(appId);';
    const start = workflow.indexOf(startMarker);
    const end = workflow.indexOf(endMarker, start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    // Isolate the classifier before execution; never run the provider, secret
    // or receipt steps. Only generated private keys enter this sandbox.
    const classifierSource = workflow.slice(start, end);
    const expression =
      '({ present, recognizedTransport, transportClass, pemBoundary, rsaParse })';
    const program = [classifierSource, expression].join(String.fromCharCode(10));
    const classifyDiagnostic = (secret: string) =>
      runInNewContext(program, { secret, Buffer, createPrivateKey }, { timeout: 2000 })
        as Pick<
          Classification,
          'present' | 'recognizedTransport' | 'transportClass' | 'pemBoundary' | 'rsaParse'
        >;

    const lf = String.fromCharCode(10);
    const cr = String.fromCharCode(13);
    const escapedLf = String.fromCharCode(92) + 'n';
    const inputs: Array<[string, string]> = [
      ['pkcs8 PEM', pkcs8],
      ['pkcs1 PEM', pkcs1],
      ['CRLF PEM', pkcs8.split(lf).join(cr + lf)],
      ['escaped newline PEM', pkcs8.split(lf).join(escapedLf)],
      ['JSON-quoted PEM', JSON.stringify(pkcs8)],
      ['single-quoted PEM', "'" + pkcs8 + "'"],
      ['base64 PEM', Buffer.from(pkcs8).toString('base64')],
      ['base64url PEM', Buffer.from(pkcs8).toString('base64url')],
      ['base64 PKCS8 DER', derPkcs8.toString('base64')],
      ['base64 PKCS1 DER', derPkcs1.toString('base64')],
      ['headerless PEM', pkcs8.split(lf).slice(1, -1).join(lf)],
      ['collapsed PEM', pkcs8.split(lf).join(' ')],
      ['empty', ''],
      ['garbage', 'not a key at all'],
      ['truncated PEM', pkcs8.slice(0, 80)],
      ['non-key base64', Buffer.from('x'.repeat(200)).toString('base64')],
      [
        'non-RSA',
        generateKeyPairSync('ec', { namedCurve: 'P-256' })
          .privateKey.export({ type: 'pkcs8', format: 'pem' })
          .toString()
          .trim(),
      ],
    ];
    for (const [label, input] of inputs) {
      const mint = classifyPrivateKey(input);
      const diagnostic = classifyDiagnostic(input);
      expect(
        {
          present: diagnostic.present,
          recognizedTransport: diagnostic.recognizedTransport,
          transportClass: diagnostic.transportClass,
          pemBoundary: diagnostic.pemBoundary,
          rsaParse: diagnostic.rsaParse,
        },
        'classifier disagreement on ' + label,
      ).toEqual({
        present: mint.present,
        recognizedTransport: mint.recognizedTransport,
        transportClass: mint.transportClass,
        pemBoundary: mint.pemBoundary,
        rsaParse: mint.rsaParse,
      });
    }
  });
});
