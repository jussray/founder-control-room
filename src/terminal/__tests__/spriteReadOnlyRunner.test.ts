import { createHash } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { SpriteReadOnlyRunner, type SpriteTransport } from '../spriteReadOnlyRunner.js';
import { FCR_SPRITES } from '../fcrSpriteCatalog.js';

const SHA = 'f957663c3a4e0520cc06d266203f212e288e498b';
const REQUEST = { runId: 'sprite-test-20261031', projectSlug: 'founder-control-room', commandId: 'git.head', expectedCommitSha: SHA };
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const TOKEN = 'fake-credential-for-unit-tests-only';
function fakeTransport(change: Record<string, unknown> = {}): SpriteTransport {
  return async (_url, options) => {
    const job = JSON.parse(options.body) as Record<string, unknown>;
    const observedOutput = SHA;
    const receipt = {
      contract: 'fcr/sprite-read-only-terminal@v1',
      repo: 'jussray/founder-control-room',
      requestId: job['requestId'],
      commandId: job['commandId'],
      exactHeadSha: SHA,
      observedOutput,
      outputDigestSha256: hash(observedOutput),
      intentFingerprintSha256: hash(JSON.stringify(job)),
      mergeAuthorized: false,
      deploymentAuthorized: false,
      privilegedAuthorityTransferred: false,
      ...change,
    };
    return { status: 200, body: JSON.stringify({ result: 'PASS', receipt }) };
  };
}

describe('FCR Sprite read-only execution transport', () => {
  it('dispatches only a fixed private management command and validates exact receipt', async () => {
    const transport = vi.fn(fakeTransport());
    const runner = new SpriteReadOnlyRunner(TOKEN, transport);
    const value = await runner.run(REQUEST);
    expect(value).toMatchObject({ runId: REQUEST.runId, status: 'passed', stdout: SHA, observedCommitSha: SHA, outputTruncated: false });
    expect(runner.cancel(REQUEST.runId)).toBe(false);
    expect(transport).toHaveBeenCalledOnce();
    const [url, options] = transport.mock.calls[0]!;
    const target = new URL(url);
    expect(target.origin).toBe('https://api.sprites.dev');
    expect(target.pathname).toBe('/v1/sprites/fcr-governed-exec/exec');
    expect(target.searchParams.getAll('cmd')).toEqual(['node', '/home/sprite/fcr/runner/read-only-terminal-stdio.cjs']);
    expect(target.searchParams.get('stdin')).toBe('true');
    expect(options.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(options.body)).toEqual({ schema: 'fcr/sprite-read-only-terminal@v1', repository: 'jussray/founder-control-room', expectedHeadSha: SHA, requestId: REQUEST.runId, commandId: REQUEST.commandId });
  });
  it('rejects writes and commands outside FCR before provider invocation', async () => {
    const transport = vi.fn(fakeTransport());
    const runner = new SpriteReadOnlyRunner(TOKEN, transport);
    await expect(runner.run({ ...REQUEST, commandId: 'git.push' })).rejects.toMatchObject({code:'UNKNOWN_COMMAND'});
    await expect(runner.run({ ...REQUEST, commandId: 'verify.unit' })).rejects.toMatchObject({code:'UNKNOWN_COMMAND'});
    await expect(runner.run({ ...REQUEST, projectSlug: 'sekret-bip' })).rejects.toMatchObject({code:'UNKNOWN_COMMAND'});
    expect(transport).not.toHaveBeenCalled();
  });
  it('does not permit stale SHAs, invalid identity or missing token', async () => {
    const transport = vi.fn(fakeTransport());
    const runner = new SpriteReadOnlyRunner(TOKEN, transport);
    await expect(runner.run({ ...REQUEST, expectedCommitSha:'short' })).rejects.toMatchObject({code:'INVALID_HEAD_SHA'});
    await expect(runner.run({ ...REQUEST, runId:'!' })).rejects.toMatchObject({code:'SPAWN_FAILED'});
    await expect(new SpriteReadOnlyRunner('', transport).run(REQUEST)).rejects.toMatchObject({code:'SPAWN_FAILED'});
    expect(transport).not.toHaveBeenCalled();
  });
  it.each([
    {description:'wrong SHA', bad:{exactHeadSha:'0'.repeat(40)}},
    {description:'wrong request',bad:{requestId:'different-run'}},
    {description:'wrong command',bad:{commandId:'git.status'}},
    {description:'fake consent',bad:{mergeAuthorized:true}},
    {description:'bad output digest',bad:{outputDigestSha256:'0'.repeat(64)}},
    {description:'bad intent binding',bad:{intentFingerprintSha256:'0'.repeat(64)}},
  ])('rejects $description', async ({bad}) => {
    await expect(new SpriteReadOnlyRunner(TOKEN, fakeTransport(bad)).run(REQUEST)).rejects.toMatchObject({code:'SPAWN_FAILED'});
  });
  it('fails closed on empty, malformed, or non-200 provider evidence', async () => {
    for (const response of [{status:200,body:''},{status:200,body:'{"result":"PASS"}'},{status:401,body:'secret body should not leak'}]) {
      const runner = new SpriteReadOnlyRunner(TOKEN, async()=>response);
      await expect(runner.run(REQUEST)).rejects.toMatchObject({code:'SPAWN_FAILED'});
    }
  });
  it('does not retry ambiguous provider timeouts', async () => {
    const transport = vi.fn(async()=>{throw new Error('provider said sensitive token string');});
    const runner = new SpriteReadOnlyRunner(TOKEN, transport);
    await expect(runner.run(REQUEST)).rejects.toMatchObject({code:'SPAWN_FAILED',message:'Sprite read-only execution outcome is unknown.'});
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

describe('FCR Sprite registry isolation', () => {
  it('keeps execution and browser proof in separate private, non-authoritative roles', () => {
    const exec = FCR_SPRITES.readOnlyExecutor;
    const verify = FCR_SPRITES.productionVerifier;
    expect(exec.name).toBe('fcr-governed-exec');
    expect(verify.name).toBe('fcr-production-proof');
    expect(exec.name).not.toBe(verify.name);
    for (const role of [exec, verify]) {
      expect(role.activatedByDefault).toBe(false);
      expect(role.publicMcpAccessible).toBe(false);
      expect(role.canMerge).toBe(false);
      expect(role.canDeploy).toBe(false);
    }
  });
});
