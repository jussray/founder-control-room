import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const fixtureShaA='a'.repeat(40),fixtureShaB='b'.repeat(40);
const root=resolve(process.cwd(),'public/control-room/exact-head');
const output=resolve(process.cwd(),'evidence');
const projects=[{id:'fcr',name:'Founder Control Room',repository:'jussray/founder-control-room'},
{id:'bip',name:'Se’kret Bip',repository:'jussray/Sekret-Bip'},
{id:'chief',name:'Chief AI Machine',repository:'jussray/chief-ai-machine'},
{id:'story',name:'StoryEngine / L99',repository:'jussray/StoryEngine'},
{id:'sol',name:'SolContinuity',repository:'jussray/solcontinuity'},
{id:'promptos',name:'PromptOS',repository:'jussray/promptos'},
{id:'games',name:'Games Hub',repository:null},
{id:'video',name:'MakeVideo',repository:'jussray/make-video-'},
{id:'image',name:'MakeImage',repository:'jussray/make-image'}];
const fixture={
  observedAt:'2026-11-05T16:00:00Z',
  project:{id:'fcr',name:'Founder Control Room',repository:'jussray/founder-control-room'},
  pullRequest:832,pr:{state:'open',draft:true,merged:false,headRepository:'jussray/founder-control-room'},exact:{baseSha:fixtureShaA,headSha:fixtureShaB,baseRef:'main',headRef:'fix/five-screen-shell-ia'},
  live:{currentBaseSha:fixtureShaA,currentHeadSha:fixtureShaB,baseMatches:true,headMatches:true,branchRelationship:{aheadBy:3,behindBy:2}},
  counts:{failing:1,queued:1,cancelled:0,duplicate:null},
  checks:[{name:'Required Gate',status:'failed',headSha:fixtureShaB,url:'https://github.com/jussray/founder-control-room/actions',observedAt:'2026-11-05T16:00:00Z'}],
  gate:{observedChecksPassed:false,requiredChecksVerified:false,merge:false,deploy:false},
  evidenceStatus:'partial_current',blockers:['Failing checks','FCR founder-final review is not established'],
  nextReversibleFix:'Inspect the first failing check and patch one evidenced cause.'
};
const mimetypes={'.html':'text/html','.css':'text/css','.js':'application/javascript'};
const server=createServer(async(req,res)=>{
  const send=(code,data,type='application/json')=>{res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store'});res.end(typeof data==='string'?data:JSON.stringify(data))};
  if(req.url==='/auth/me')return req.headers.cookie?.includes('fixture-session=yes')?send(200,{data:{founder:{email:'fixture'}}}):send(401,{error:'Founder session required'});
  if(req.url==='/integration-cockpit/projects')return req.headers.cookie?.includes('fixture-session=yes')?send(200,{projects}):send(401,{code:'UNAUTHENTICATED'});
  if(req.url==='/integration-cockpit/inspect/fcr/832')return req.headers.cookie?.includes('fixture-session=yes')?send(200,fixture):send(401,{code:'UNAUTHENTICATED'});
  const path=req.url?.startsWith('/control-room/exact-head/')?req.url.slice('/control-room/exact-head/'.length):'';
  const safe=['','index.html','style.css','app.js'].includes(path)?path||'index.html':null;
  if(safe===null)return send(404,'Not found','text/plain');
  const file=resolve(root,safe);
  const bytes=await readFile(file).catch(()=>null);
  if(!bytes)return send(404,'Not found','text/plain');
  res.writeHead(200,{'Content-Type':mimetypes[extname(file)],'Cache-Control':'no-store'});res.end(bytes);
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const port=server.address().port,origin='http://127.0.0.1:'+port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
  await mkdir(output,{recursive:true});
  const anon=await browser.newContext({viewport:{width:1440,height:900}});
  const p=await anon.newPage();
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(origin+'/control-room/exact-head/',{waitUntil:'load'});
  await p.getByRole('heading',{name:'Sign in to Founder Control Room'}).waitFor();
  if(await p.locator('#private').isVisible())throw Error('Anonymous private content exposed');
  if((await p.locator('body').innerText()).includes('jussray/'))throw Error('Repository leaked in anonymous UI');
  await p.screenshot({path:resolve(output,'exact-head-locked-1440.png'),fullPage:true});
  if(errors.length)throw Error('Anonymous JS error: '+errors.join(','));
  await anon.close();
  const authorized=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
  await authorized.addCookies([{name:'fixture-session',value:'yes',url:origin}]);
  const page=await authorized.newPage();const authErrors=[];
  page.on('pageerror',e=>authErrors.push(e.message));
  await page.goto(origin+'/control-room/exact-head/',{waitUntil:'load'});
  await page.getByRole('heading',{name:'Exact-head diagnosis'}).waitFor();
  if(await page.locator('#private').isHidden())throw Error('Verified fixture view remained hidden');
  await page.locator('#pr').fill('832');
  await page.getByRole('button',{name:'Inspect ↗'}).click();
  await page.getByText('Required Gate',{exact:true}).waitFor();
  await page.getByRole('heading',{name:/PR #832.*DRAFT/}).waitFor();
  await page.getByText('Inspect the first failing check and patch one evidenced cause.').waitFor();
  if((await page.locator('#source').innerText())!=='PARTIAL')throw Error('Missing partial-evidence label');
  if(!(await page.getByRole('button',{name:'07 Deploy'}).isDisabled()))throw Error('Deploy stage unlocked without receipt');
  if(!(await page.getByRole('button',{name:'08 Production proof'}).isDisabled()))throw Error('Production proof stage unlocked');
  await page.screenshot({path:resolve(output,'exact-head-fixture-1440.png'),fullPage:true});
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Export local handoff ↗'}).click()]);
  if(download.suggestedFilename()!=='fcr-exact-head-record.json')throw Error('Handoff artifact incorrect');
  const mobile=await authorized.newPage({viewport:{width:390,height:844}});
  await mobile.goto(origin+'/control-room/exact-head/',{waitUntil:'load'});
  await mobile.locator('#pr').fill('832');
  await mobile.getByRole('button',{name:'Inspect ↗'}).click();
  await mobile.getByText('Required Gate',{exact:true}).waitFor();
  await mobile.screenshot({path:resolve(output,'exact-head-fixture-390.png'),fullPage:true});
  if(authErrors.length)throw Error('Authenticated UI error: '+authErrors.join(','));
  console.log('PASS: anonymous gate, session fixture, exact-head render, release-locked stages, local record export, desktop/mobile Playwright UI');
  console.log('LIMITATION: synthetic fixture only; provider auth and deployed runtime NOT VERIFIED');
}finally{await browser.close();await new Promise(done=>server.close(done));}
