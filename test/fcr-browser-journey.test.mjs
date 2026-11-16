import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { enforceSameOriginRoute, enforceSameOriginWebSocket, validateJourney, validateOrigin, substituteVariables } from '../scripts/fcr-browser-journey.mjs';

const manifest = JSON.parse(readFileSync(new URL('../config/browser-journeys/sync-party.json', import.meta.url), 'utf8'));
const copy = () => structuredClone(manifest);

test('the reviewed Sync Party journey validates as synthetic, same-origin, two-player proof', () => {
  const result = validateJourney(manifest);
  assert.equal(result.project, 'sync-party-game');
  assert.equal(result.origin, 'https://sync.jussco.company');
  assert.equal(result.actors, 2);
  assert.ok(result.steps >= 40);
  assert.equal(manifest.steps.filter((step) => step.action === 'captureText').length, 1);
  assert.equal(manifest.steps.filter((step) => step.action === 'click' && step.selector === '.choice:first-child').length, 10);
});

test('unapproved target domains and private or unsafe protocols fail closed', () => {
  for (const url of [
    'http://sync.jussco.company/',
    'https://127.0.0.1/',
    'https://localhost/',
    'https://evil.example/',
    'https://sync.jussco.company.evil.example/',
    'https://alice:password@sync.jussco.company/',
    'https://sync.jussco.company/?token=fake',
    'https://sync.jussco.company:444/'
  ]) {
    assert.throws(() => validateOrigin(url), url);
  }
});

test('the operator rejects undeclared actors, unreviewed actions and cross-origin navigation', () => {
  const wrongActor = copy();
  wrongActor.steps[0].actor = 'unknown';
  assert.throws(() => validateJourney(wrongActor));
  const arbitraryCode = copy();
  arbitraryCode.steps[0].action = 'evaluate';
  assert.throws(() => validateJourney(arbitraryCode));
  const crossOrigin = copy();
  crossOrigin.steps[0].path = '//elsewhere.example/';
  assert.throws(() => validateJourney(crossOrigin));
});

test('browser actions require explicit synthetic authorization', () => {
  const wrong = copy();
  wrong.approvedSyntheticActions = false;
  assert.throws(() => validateJourney(wrong));
  const nonsynthetic = copy();
  nonsynthetic.syntheticOnly = false;
  assert.throws(() => validateJourney(nonsynthetic));
});

test('no unverified variable may be used before capture', () => {
  const wrong = copy();
  wrong.steps[0] = { actor: 'host', label: 'Use missing room', action: 'fill', selector: '#joinCode', value: '{{roomCode}}' };
  assert.throws(() => validateJourney(wrong));
  assert.equal(substituteVariables('Room {{roomCode}}', { roomCode: 'ABCDE' }), 'Room ABCDE');
  assert.throws(() => substituteVariables('{{secret}}', {}));
});

test('all steps have traceable titles but never require actual user credentials', () => {
  assert.ok(manifest.steps.every((step) => step.label && step.actor));
  const serialized = JSON.stringify(manifest);
  assert.doesNotMatch(serialized, /password|auth_token|api_key|secret_key/i);
});

test('the network guard blocks cross-origin HTTP redirects without following them', async () => {
  const actions = [];
  const route = {
    request: () => ({ url: () => 'https://sync.jussco.company/redirect' }),
    fetch: async (options) => {
      actions.push(['fetch', options]);
      return { status: () => 302 };
    },
    abort: async (reason) => { actions.push(['abort', reason]); },
    fulfill: async () => { actions.push(['fulfill']); },
    continue: async () => { actions.push(['continue']); },
  };
  await enforceSameOriginRoute(route, 'https://sync.jussco.company');
  assert.deepEqual(actions, [
    ['fetch', { maxRedirects: 0 }],
    ['abort', 'blockedbyclient'],
  ]);
});

test('the network guard fulfills normal same-origin responses but never fetches foreign hosts', async () => {
  const actions = [];
  const route = (url, status) => ({
    request: () => ({ url: () => url }),
    fetch: async (options) => {
      actions.push(['fetch', options]);
      return { status: () => status };
    },
    abort: async (reason) => { actions.push(['abort', reason]); },
    fulfill: async ({ response }) => { actions.push(['fulfill', response.status()]); },
    continue: async () => { actions.push(['continue']); },
  });
  await enforceSameOriginRoute(route('https://sync.jussco.company/safe', 200), 'https://sync.jussco.company');
  assert.deepEqual(actions, [['fetch', { maxRedirects: 0 }], ['fulfill', 200]]);
  actions.length = 0;
  await enforceSameOriginRoute(route('https://elsewhere.example/leak', 200), 'https://sync.jussco.company');
  assert.deepEqual(actions, [['abort', 'blockedbyclient']]);
});

test('WebSocket guard only forwards the approved origin and rejects external sockets', () => {
  const calls = [];
  const socketRoute = (url) => ({
    url: () => url,
    connectToServer: () => { calls.push(['connect', url]); },
    close: (options) => { calls.push(['close', options.code]); },
  });
  const origin = 'https://sync.jussco.company';
  enforceSameOriginWebSocket(socketRoute('wss://sync.jussco.company/sync'), origin);
  assert.deepEqual(calls, [['connect', 'wss://sync.jussco.company/sync']]);
  for (const foreign of [
    'wss://evil.example/sync',
    'wss://sync.jussco.company.evil.example/sync',
    'wss://sync.jussco.company:8443/sync',
    'ws://sync.jussco.company/sync',
    'not-a-websocket',
  ]) {
    calls.length = 0;
    enforceSameOriginWebSocket(socketRoute(foreign), origin);
    assert.deepEqual(calls, [['close', 1008]], foreign);
  }
});

