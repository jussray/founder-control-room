import { resolve } from 'node:path';
import { pathToFileURL, URLSearchParams } from 'node:url';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { parseRunUrl } from './triage.mjs';

const ACCOUNTS = new Set(['mcgillraylene@gmail.com', 'sekretbip@gmail.com', 'raymcg9@gmail.com']);
const EMAIL_QUERY = 'newer_than:7d {from:notifications@github.com from:gitguardian.com}';
const GMAIL_ORIGIN = 'https://gmail.googleapis.com';
const RUN_LINKS = /https:\/\/github\.com\/jussray\/[A-Za-z0-9_.-]+\/actions\/runs\/[1-9][0-9]*/g;
const REPO = /^jussray\/[A-Za-z0-9_.-]+$/;
const HEADER_NAMES = new Set(['from', 'subject']);
const PAGE_SIZE = 50;
const MAX_PAGES = 5;
const MAX_TEXT_BYTES = 131072;

function parseSafeHeaders(payload) {
  const result = {};
  for (const entry of payload?.headers || []) {
    const name = String(entry?.name || '').toLowerCase();
    if (HEADER_NAMES.has(name) && typeof entry.value === 'string') {
      result[name] = entry.value.slice(0, 500);
    }
  }
  return result;
}

function trustedSignalSender(from) {
  // The sender is only a filter, not proof: GitHub must recheck the event.
  return /(?:^|[<\s])notifications@github\.com(?:>|\s|$)/i.test(from) ||
    /(?:^|[<\s])[^<>\s@]+@gitguardian\.com(?:>|\s|$)/i.test(from);
}

function decodeBase64Text(value) {
  if (typeof value !== 'string' || value.length > MAX_TEXT_BYTES * 2) return '';
  try {
    return Buffer.from(value, 'base64url').toString('utf8').slice(0, MAX_TEXT_BYTES);
  } catch {
    return '';
  }
}

function collectTextParts(part, depth = 0, budget = { parts: 0 }) {
  if (!part || depth > 5 || budget.parts >= 20) return '';
  budget.parts++;
  const mime = part.mimeType;
  let text = '';
  if (mime === 'text/plain' || mime === 'text/html') {
    text = decodeBase64Text(part.body?.data);
  }
  for (const child of part.parts || []) {
    if (text.length >= MAX_TEXT_BYTES) break;
    text += '\n' + collectTextParts(child, depth + 1, budget);
  }
  return text.slice(0, MAX_TEXT_BYTES);
}

function canonicalRunUrl(message, repo) {
  const text = collectTextParts(message.payload);
  for (const raw of text.match(RUN_LINKS) || []) {
    const parsed = parseRunUrl(raw, repo);
    if (parsed) return parsed.url;
  }
  return undefined;
}

async function gmailGet(path, token, fetcher) {
  const response = await fetcher(GMAIL_ORIGIN + path, {
    method: 'GET',
    headers: { authorization: 'Bearer ' + token, accept: 'application/json' },
    redirect: 'error',
    signal: globalThis.AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error('GMAIL_READ_ONLY_READBACK_BLOCKED');
  return response.json();
}

/**
 * Read only the minimum metadata from selected Gmail notifications.
 * Requires caller-provided OAuth token granted Gmail read-only scope.
 * NO messages or raw provider errors are logged, cached, returned, or written.
 */
export async function fetchGmailAlertMetadata({ token, mailbox, repo, fetcher = globalThis.fetch }) {
  if (!token || typeof token !== 'string') throw new Error('GMAIL_TOKEN_UNAVAILABLE');
  if (!ACCOUNTS.has(mailbox)) throw new Error('GMAIL_MAILBOX_NOT_AUTHORIZED');
  if (!REPO.test(repo || '')) throw new Error('GITHUB_REPO_NOT_AUTHORIZED');
  const profile = await gmailGet('/gmail/v1/users/me/profile', token, fetcher);
  if (String(profile.emailAddress || '').toLowerCase() !== mailbox) {
    throw new Error('GMAIL_PROFILE_MISMATCH');
  }
  const hits = [];
  let pageToken = '';
  let complete = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ q: EMAIL_QUERY, includeSpamTrash: 'true', maxResults: String(PAGE_SIZE) });
    if (pageToken) params.set('pageToken', pageToken);
    const pageData = await gmailGet('/gmail/v1/users/me/messages?' + params.toString(), token, fetcher);
    if (!Array.isArray(pageData.messages) && pageData.messages != null) throw new Error('GMAIL_PAGE_SHAPE_INVALID');
    hits.push(...(pageData.messages || []).slice(0, PAGE_SIZE));
    if (!pageData.nextPageToken) { complete = true; break; }
    if (typeof pageData.nextPageToken !== 'string' || pageData.nextPageToken === pageToken) throw new Error('GMAIL_PAGE_TOKEN_INVALID');
    pageToken = pageData.nextPageToken;
  }
  // Never declare a complete audit from a silently truncated result.
  if (!complete) throw new Error('GMAIL_COVERAGE_INCOMPLETE');
  const notices = [];
  for (const hit of hits) {
    if (!/^[a-f0-9]{8,40}$/i.test(hit?.id || '')) continue;
    const message = await gmailGet('/gmail/v1/users/me/messages/' + encodeURIComponent(hit.id) + '?format=full', token, fetcher);
    const headers = parseSafeHeaders(message.payload);
    if (!trustedSignalSender(headers.from || '')) continue;
    const security = /gitguardian\.com/i.test(headers.from || '');
    const url = canonicalRunUrl(message, repo);
    // Security alerts without GitHub run links must identify this exact repo,
    // and remain unverified. Never parse or expose actual secret values.
    if (!url && !(security && String(headers.subject || '').toLowerCase().includes(repo.toLowerCase()))) continue;
    const millis = Number(message.internalDate);
    const received = Number.isFinite(millis) && millis > 0 ? new Date(millis).toISOString() : '';
    notices.push({
      message_id: hit.id,
      mailbox,
      received_at: received,
      labels: (message.labelIds || []).filter(x => ['INBOX', 'SPAM', 'TRASH'].includes(x)),
      kind: security ? 'security' : 'actions',
      ...(url ? { run_url: url } : {}),
    });
  }
  return { schema: 'juss.actions-mail-input@v1', notices };
}

async function main() {
  const result = await fetchGmailAlertMetadata({
    token: process.env.GMAIL_READONLY_ACCESS_TOKEN,
    mailbox: process.env.GMAIL_AUDIT_MAILBOX,
    repo: process.env.GITHUB_REPOSITORY,
  });
  process.stdout.write(JSON.stringify(result) + '\n');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => {
    process.stderr.write('BLOCKED: Gmail authorization or read-only metadata coverage unavailable\n');
    process.exitCode = 2;
  });
}
