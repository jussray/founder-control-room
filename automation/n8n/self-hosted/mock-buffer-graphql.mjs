import http from 'node:http';

const expectedKey = String(process.env.BUFFER_MOCK_API_KEY ?? '').trim();
if (!expectedKey) throw new Error('BUFFER_MOCK_API_KEY is required');

const server = http.createServer(async (request, response) => {
  if (request.method !== 'POST' || request.url !== '/') {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not_found' }));
    return;
  }

  if (String(request.headers.authorization ?? '') !== `Bearer ${expectedKey}`) {
    response.writeHead(401, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ errors: [{ message: 'unauthorized' }] }));
    return;
  }

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);

  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ errors: [{ message: 'invalid_json' }] }));
    return;
  }

  const query = typeof body?.query === 'string' ? body.query : '';
  if (!query.includes('createPost(')
    || !query.includes('schedulingType: automatic')
    || !query.includes('mode: customScheduled')
    || query.includes('mode: shareNow')) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: { createPost: { message: 'unsafe_or_invalid_schedule_contract' } } }));
    return;
  }

  const dueAtMatch = query.match(/dueAt:\s*"([^"]+)"/);
  const channelMatch = query.match(/channelId:\s*"([^"]+)"/);
  if (!dueAtMatch || !channelMatch || !Number.isFinite(Date.parse(dueAtMatch[1]))) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: { createPost: { message: 'missing_schedule_fields' } } }));
    return;
  }

  if (!['buffer-proof-linkedin', 'buffer-proof-facebook'].includes(channelMatch[1])) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: { createPost: { message: 'unexpected_channel' } } }));
    return;
  }

  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({
    data: {
      createPost: {
        post: {
          id: 'buffer-proof-post-1',
          dueAt: new Date(dueAtMatch[1]).toISOString(),
        },
      },
    },
  }));
});

server.listen(18080, '0.0.0.0', () => {
  process.stdout.write('buffer proof server listening on 18080\n');
});
