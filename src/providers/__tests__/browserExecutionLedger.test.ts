import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { browserExecutionLedger } from '../browserExecutionLedger.js';

const scope = { projectId: '11111111-1111-4111-8111-111111111111', missionId: '22222222-2222-4222-8222-222222222222', actor: 'founder-fixture' };
const digest = 'a'.repeat(64);
const rowId = '33333333-3333-4333-8333-333333333333';
const receipt = {envelopeHash:digest,outcome:'verified' as const,beforeFingerprint:'b'.repeat(64),afterFingerprint:'c'.repeat(64)};
function fixture() {
  const insertResult = vi.fn(async () => ({data:{id:rowId},error:null as unknown}));
  const updateResult = vi.fn(async () => ({data:{id:rowId},error:null as unknown}));
  const insert = vi.fn(() => ({select: () => ({single:insertResult})}));
  const query = {eq:vi.fn(),is:vi.fn(),select:vi.fn(() => ({maybeSingle:updateResult}))};
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  const update = vi.fn(() => query);
  const from = vi.fn(() => ({insert,update}));
  const client = {from} as unknown as Pick<SupabaseClient,'from'>;
  return {ledger:browserExecutionLedger(client,scope),insert,update,insertResult,updateResult,query,from};
}

describe('browser execution ledger adapter', () => {
  it('claims once through the existing unique execution ledger', async () => {
    const f=fixture();
    expect(await f.ledger.reserve('intent-once',digest)).toBe(true);
    expect(await f.ledger.reserve('intent-once',digest)).toBe(false);
    expect(f.from).toHaveBeenCalledWith('approval_executions');
    expect(f.insert).toHaveBeenCalledWith(expect.objectContaining({status:'pending',idempotency_key:'intent-once',project_id:scope.projectId,mission_id:scope.missionId,executed_by:scope.actor,request:{envelopeHash:digest}}));
    expect(f.insert).toHaveBeenCalledTimes(1);
  });
  it('fails closed when the durable insert reports a conflict', async () => {
    const f=fixture();
    f.insertResult.mockResolvedValueOnce({data:{id:rowId},error:{code:'23505'}});
    expect(await f.ledger.reserve('intent-once',digest)).toBe(false);
    expect(await f.ledger.persist('intent-once',receipt)).toBe(false);
    expect(f.update).not.toHaveBeenCalled();
  });
  it('rejects receipt mismatches and unreserved writes', async () => {
    const f=fixture();
    expect(await f.ledger.persist('intent-once',receipt)).toBe(false);
    await f.ledger.reserve('intent-once',digest);
    expect(await f.ledger.persist('wrong-key',receipt)).toBe(false);
    expect(await f.ledger.persist('intent-once',{...receipt,envelopeHash:'f'.repeat(64)})).toBe(false);
    expect(f.update).not.toHaveBeenCalled();
  });
  it('keeps an uncertain provider effect pending and prohibits automatic replay', async () => {
    const f=fixture();
    await f.ledger.reserve('intent-once',digest);
    expect(await f.ledger.persist('intent-once',{...receipt,outcome:'unverified',afterFingerprint:null})).toBe(true);
    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({status:'pending',success:null,executed_at:null,result:expect.objectContaining({outcome:'unverified'})}));
    expect(await f.ledger.reserve('intent-once',digest)).toBe(false);
    expect(await f.ledger.persist('intent-once',receipt)).toBe(false);
  });
  it('marks verified only after the conditional row update returns its exact identity', async () => {
    const f=fixture();
    await f.ledger.reserve('intent-once',digest);
    expect(await f.ledger.persist('intent-once',receipt)).toBe(true);
    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({status:'succeeded',success:true,result:receipt}));
    expect(f.query.eq).toHaveBeenCalledWith('id',rowId);
    expect(f.query.eq).toHaveBeenCalledWith('request->>envelopeHash',digest);
    expect(f.query.is).toHaveBeenCalledWith('result->>outcome',null);
  });
  it('does not claim durable evidence if readback differs', async () => {
    const f=fixture();
    await f.ledger.reserve('intent-once',digest);
    f.updateResult.mockResolvedValueOnce({data:{id:'other-row'},error:null});
    expect(await f.ledger.persist('intent-once',receipt)).toBe(false);
  });
});
