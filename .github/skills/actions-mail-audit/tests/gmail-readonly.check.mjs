import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchGmailAlertMetadata } from '../scripts/gmail-readonly.mjs';

const repo = 'jussray/founder-control-room';
const mailbox = 'mcgillraylene@gmail.com';
const body = Buffer.from(
  'Details: https://github.com/jussray/founder-control-room/actions/runs/41156805451?email_token=PRIVATE_NOT_FOR_OUTPUT',
  'utf8',
).toString('base64url');

function mockGmail({ profile = mailbox, sender = 'GitHub <notifications@github.com>', subject = 'Failure on main',
                     sourceText = body, ids = ['abc12345'], labels = ['INBOX', 'UNREAD'] } = {}) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url: String(url), options });
    const u = new URL(url);
    let response;
    if (u.pathname.endsWith('/profile')) response = { emailAddress: profile };
    else if (u.pathname.endsWith('/messages')) response = { messages: ids.map(id => ({ id })) };
    else if (/\/messages\/[a-f0-9]+$/.test(u.pathname)) response = {
      id: u.pathname.split('/').at(-1),
      internalDate: '1793401200000',
      labelIds: labels,
      payload: {
        headers: [{ name: 'From', value: sender }, { name: 'Subject', value: subject }],
        parts: [{ mimeType: 'text/plain', body: { data: sourceText } }],
      },
    };
    else throw new Error('unrecognized mocked Gmail GET');
    return { ok: true, json: async () => response };
  };
  return { fetcher, calls };
}

describe('Gmail alert ingestion metadata is read-only, bounded, and opt-in', () => {
  it('reads the authorized mailbox, strips email tracking, and never emits body or token', async () => {
    const { fetcher, calls } = mockGmail();
    const result = await fetchGmailAlertMetadata({ token: 'IN_MEMORY_ONLY', mailbox, repo, fetcher });
    assert.equal(result.schema, 'juss.actions-mail-input@v1');
    assert.equal(result.notices.length, 1);
    assert.equal(result.notices[0].run_url, 'https://github.com/jussray/founder-control-room/actions/runs/41156805451');
    assert.deepEqual(result.notices[0].labels, ['INBOX']);
    assert.equal(JSON.stringify(result).includes('PRIVATE_NOT_FOR_OUTPUT'), false);
    assert.equal(JSON.stringify(result).includes('IN_MEMORY_ONLY'), false);
    assert.ok(calls.every(x => x.options.method === 'GET' && x.options.redirect === 'error'));
    assert.ok(calls.some(x => new URL(x.url).searchParams.get('includeSpamTrash') === 'true'));
  });
  it('rejects wrong mailbox owner before listing or reading any messages', async () => {
    const { fetcher, calls } = mockGmail({ profile: 'other@example.test' });
    await assert.rejects(fetchGmailAlertMetadata({ token: 'test', mailbox, repo, fetcher }), /GMAIL_PROFILE_MISMATCH/);
    assert.equal(calls.length, 1);
  });
  it('rejects unavailable credentials without making API calls', async () => {
    const { fetcher, calls } = mockGmail();
    await assert.rejects(fetchGmailAlertMetadata({ token: '', mailbox, repo, fetcher }), /GMAIL_TOKEN_UNAVAILABLE/);
    assert.equal(calls.length, 0);
  });
  it('rejects other repository run links and untrusted senders', async () => {
    const crossLink = Buffer.from('https://github.com/jussray/Sekret-Bip/actions/runs/150', 'utf8').toString('base64url');
    const cross = mockGmail({ sourceText: crossLink });
    const outcome = await fetchGmailAlertMetadata({ token: 'test', mailbox, repo, fetcher: cross.fetcher });
    assert.deepEqual(outcome.notices, []);
    const forged = mockGmail({ sender: 'Scammer <fake@bad.example>' });
    const second = await fetchGmailAlertMetadata({ token: 'test', mailbox, repo, fetcher: forged.fetcher });
    assert.deepEqual(second.notices, []);
  });
  it('holds scoped GitGuardian alerts without inventing GitHub run evidence', async () => {
    const mock = mockGmail({
      sender: 'Security <alerts@gitguardian.com>',
      subject: 'Incident in jussray/founder-control-room',
      sourceText: Buffer.from('Credential report needs private review').toString('base64url'),
      labels: ['SPAM', 'UNREAD'],
    });
    const out = await fetchGmailAlertMetadata({ token: 'test', mailbox, repo, fetcher: mock.fetcher });
    assert.equal(out.notices.length, 1);
    assert.equal(out.notices[0].kind, 'security');
    assert.deepEqual(out.notices[0].labels, ['SPAM']);
    assert.equal('run_url' in out.notices[0], false);
  });
});
