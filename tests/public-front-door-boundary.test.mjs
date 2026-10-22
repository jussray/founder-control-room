import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const cfg=JSON.parse(readFileSync(new URL('../.control-room/public-front-door-boundary.json',import.meta.url),'utf8'));
test('front door preserves public entrance and independently protected owner paths',()=>{
 assert.equal(cfg.schema,'fcr/public-front-door-boundary@v1');
 assert.ok(cfg.publicPaths.includes('/'));
 assert.ok(cfg.publicPaths.includes('/juss-rayy/'));
 const protectedPaths=cfg.protectedPaths;
 for(const pattern of ['/control-room','/control-room/*','/admin','/admin/*','/api/founder','/api/founder/*'])
  assert.ok(protectedPaths.includes(pattern),pattern);
 assert.ok(!protectedPaths.includes('/*'),'Never treat blanket public or blanket protected path as an equivalent scoped policy');
 for(const path of cfg.publicPaths)assert.ok(!protectedPaths.includes(path),path);
});
test('no product ownership confusion in boundary contract',()=>{
 assert.match(cfg.crossProductRule,/independent/);
 assert.match(cfg.crossProductRule,/PromptOS/);
 assert.match(cfg.crossProductRule,/SOL/);
});
