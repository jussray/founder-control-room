import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const source = readFileSync(new URL('../../public/_worker.js', import.meta.url), 'utf8');
const handler = (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default;
const forwarded = [];
const env = {
  ASSETS: { fetch: async () => new Response('<title>FCR local proof</title>', {headers:{'content-type':'text/html'}}) },
  FCR_API: { fetch: async request => {
    forwarded.push(new URL(request.url).pathname);
    return new Response(JSON.stringify({ok:true}),{headers:{'content-type':'application/json','x-founder-control-room-service':'founder-control-room'}});
  }},
};
const http = createServer(async (incoming, response) => {
  const chunks=[];for await(const chunk of incoming)chunks.push(chunk);
  const request = new Request('http://127.0.0.1:' + http.address().port + incoming.url,{
    method:incoming.method,headers:incoming.headers,
    body:['GET','HEAD'].includes(incoming.method)?undefined:Buffer.concat(chunks),
  });
  const result=await handler.fetch(request,env);
  response.writeHead(result.status,Object.fromEntries(result.headers));
  response.end(Buffer.from(await result.arrayBuffer()));
});
await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
let browser;
try {
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:'+http.address().port+'/');
  const actual=await page.evaluate(async()=>{
    const paths=['/mcp/founder-signal-engine','/mcp/founder-signal-engine/','/MCP/FOUNDER-SIGNAL-ENGINE','/mcp/founder-signal-x-engagement'];
    return Promise.all(paths.map(async route=>(await fetch(route,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status));
  });
  if(JSON.stringify(actual)!==JSON.stringify([403,403,403,200]))throw Error('LOCAL_BROWSER_PROOF_FAILED');
  if(forwarded.length!==1 || forwarded[0]!=='/mcp/founder-signal-x-engagement')throw Error('UPSTREAM_BOUNDARY_FAILED');
  console.log(JSON.stringify({schema:'fcr/local-edge-playwright@v1',state:'PASS',statuses:actual,forwardedRoutes:forwarded.length}));
} finally {await browser?.close();await new Promise(resolve=>http.close(resolve));}
