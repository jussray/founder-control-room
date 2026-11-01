import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql=readFileSync(new URL('../docs/implementation/FCR_PUBLIC_TENANCY_REVIEW_CANDIDATE.sql',import.meta.url),'utf8');
const tables=['tenants','memberships','projects','billing_receipts','entitlements'];

test('customer schema proposal is explicitly unexecuted and creates isolated public-only tables',()=>{
 assert.match(sql,/SOURCE-ONLY REVIEW CANDIDATE\. NOT APPLIED/);
 assert.doesNotMatch(sql,/\bpublic\.(?:projects|founder_users|approvals|missions)\b/i);
 for(const name of tables){
  assert.match(sql,new RegExp('create table public\\.fcr_public_'+name+'\\b'));
  assert.match(sql,new RegExp('alter table public\\.fcr_public_'+name+' enable row level security'));
  assert.match(sql,new RegExp('revoke all on public\\.fcr_public_'+name+' from public, anon, authenticated'));
 }
});

test('no client write grants, paid or billing read grants, or user-editable authorization sources',()=>{
 assert.doesNotMatch(sql,/grant (?:all|insert|update|delete)\b/i);
 assert.doesNotMatch(sql,/grant select on public\.fcr_public_(?:entitlements|billing_receipts|tenants)/i);
 const executableSql=sql.split('\n').filter(line=>!line.trimStart().startsWith('--')).join('\n');
 assert.doesNotMatch(executableSql,/raw_user_meta_data|user_metadata|security definer/i);
 assert.match(sql,/unique \(provider, provider_event_id\)/i);
 assert.match(sql,/foreign key \(verified_receipt_id, tenant_id\)/i);
});

test('authenticated read policy scopes by verified identity and active tenant membership',()=>{
 assert.match(sql,/create policy fcr_public_own_active_memberships/);
 assert.match(sql,/user_id = \(select auth\.uid\(\)\)/);
 assert.match(sql,/status = 'active'/);
 assert.match(sql,/create policy fcr_public_own_projects/);
 assert.match(sql,/m\.tenant_id = fcr_public_projects\.tenant_id/);
 assert.match(sql,/m\.user_id = \(select auth\.uid\(\)\)/);
 assert.doesNotMatch(sql,/auth\.jwt\(\) ->> 'client_id'/);
});
