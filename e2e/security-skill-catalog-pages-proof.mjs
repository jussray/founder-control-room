// Local-only browser proof of the actual packaged page and Pages routing.
// Authentication responses are synthetic; this does not prove live sessions.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import pagesWorker from '../dist-pages/_worker.js';

const catalog = JSON.parse(await readFile(new URL('../docs/security-skill-catalog.v1.json', import.meta.url), 'utf8'));
const files = new Map([
  ['/control-room/security.html', 'text/html; charset=utf-8'],
  ['/control-room/security.css', 'text/css; charset=utf-8'],
  ['/control-room/security.js', 'text/javascript; charset=utf-8'],
  ['/control-room/security-skill-catalog.mjs', 'text/javascript; charset=utf-8'],
  ['/favicon.ico', 'image/x-icon'],
]);
const assets = new Map();
for (const [pathname, type] of files) {
  assets.set(pathname, {type, bytes: await readFile(new URL('../dist-pages' + pathname, import.meta.url))});
}
const calls = [];
function reply(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: {'Content-Type':'application/json','Cache-Control':'no-store','x-founder-control-room-service':'founder-control-room'},
  });
}
const env = {
  ASSETS: {async fetch(request) {
    const file = assets.get(new URL(request.url).pathname);
    return file ? new Response(file.bytes,{headers:{'Content-Type':file.type,'Cache-Control':'no-store'}}) : new Response('Not found',{status:404});
  }},
  FCR_API: {async fetch(request) {
    const path = new URL(request.url).pathname;
    const mode = (request.headers.get('cookie') || '').match(/(?:^|; )fixture=(founder|revoked|outage)/)?.[1] || 'guest';
    calls.push({mode,path,method:request.method});
    if (request.method !== 'GET') return reply({error:'read only'},405);
    if (path === '/security-posture') return mode === 'guest' ? reply({error:'Founder session required'},401) : reply({summary:{},stages:[],projects:[]});
    if (path === '/founder-os/security-skills/catalog') {
      if (mode === 'guest' || mode === 'revoked') return reply({error:'Founder session required'},403);
      if (mode === 'outage') return reply({error:'Unavailable'},503);
      return reply(catalog);
    }
    return reply({error:'Not found'},404);
  }},
};
let origin;
const server = createServer(async (req,res) => {
  try {
    const response = await pagesWorker.fetch(new Request(new URL(req.url,origin),{method:req.method,headers:req.headers}),env);
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500);
    res.end('Fixture unavailable');
  }
});
server.listen(0,'127.0.0.1');
await once(server,'listening');
origin = 'http://127.0.0.1:' + server.address().port;
let browser;
try {
  browser = await chromium.launch({headless:true});
  for (const width of [1440,390,320]) {
    for (const mode of ['founder','guest','revoked','outage']) {
      const context = await browser.newContext({viewport:{width,height:900}});
      try {
        if (mode !== 'guest') await context.addCookies([{name:'fixture',value:mode,url:origin,httpOnly:true,sameSite:'Strict'}]);
        const page = await context.newPage();
        const errors = [], external = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/*', async route => {
          if (new URL(route.request().url()).origin !== origin) {
            external.push(route.request().url()); await route.abort(); return;
          }
          await route.continue();
        });
        const start = calls.length;
        const response = await page.goto(origin+'/control-room/security.html');
        assert.equal(response.status(),200);
        if (mode === 'founder') {
          const library = page.locator('#security-skill-library');
          await library.getByRole('heading',{name:'Security Skills Library'}).waitFor();
          assert.equal(await library.locator('article').count(),3);
          for (const name of ['AEGIS','SARISSA','MEDUSA']) assert.ok((await library.innerText()).includes(name));
          assert.equal(await library.locator('button,input,form').count(),0);
        } else if (mode === 'outage') {
          await page.getByText('Security Skills Library unavailable. No cached catalog is shown.',{exact:true}).waitFor();
          assert.equal(await page.locator('#security-skill-library article').count(),0);
        } else {
          await page.getByRole('heading',{name:'Security posture locked.'}).waitFor();
          assert.equal(await page.locator('#security-skill-library').count(),0);
        }
        const requests = calls.slice(start);
        assert.equal(requests.filter(r=>r.path==='/security-posture').length,1);
        assert.equal(requests.filter(r=>r.path==='/founder-os/security-skills/catalog').length,mode==='guest'?0:1);
        assert.ok(requests.every(r=>r.method==='GET'));
        assert.deepEqual(errors,[]);
        assert.deepEqual(external,[]);
        if (mode === 'founder') assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth + 1));
        console.log(JSON.stringify({width,mode,result:'passed',scope:'packaged page and edge proxy with simulated API'}));
      } finally { await context.close(); }
    }
  }
} finally {
  try { await browser?.close(); } finally { await new Promise(resolve=>server.close(resolve)); }
}
