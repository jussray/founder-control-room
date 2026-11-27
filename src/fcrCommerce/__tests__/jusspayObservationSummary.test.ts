import {describe,expect,it} from 'vitest';
import {summarizeJussPayObservations} from '../jusspayObservationSummary.js';
const base={schema:'jusspay/commerce-receipt@v1',receiptId:'a'.repeat(64),orderRefHash:'b'.repeat(64),product:'jbh',mode:'live',event:'payment_recorded',grossMinor:1000,currency:'usd',occurredAt:'2026-11-27T13:00:00.000Z',releaseSha:'c'.repeat(40)};
const hold={...base,receiptId:'d'.repeat(64),event:'refund_hold',grossMinor:null};
describe('JussPay observation summary',()=>{
 it('distinguishes observed gross from settlement, counts holds and returns no order identifiers',()=>{
  const s=summarizeJussPayObservations([base,hold],2);
  expect(s).toMatchObject({state:'observed',scope:'latest_ingested_receipts',currency:'usd',receiptCount:2,availableReceiptCount:2,partial:false,observedGrossMinor:1000,paymentOrders:1,refundHoldOrders:1,disputeHoldOrders:0,netRevenueMinor:null,settlementVerified:false});
  expect(s.byProduct).toEqual([{product:'jbh',observedGrossMinor:1000,paymentOrders:1,refundHoldOrders:1,disputeHoldOrders:0}]);
  expect(JSON.stringify(s)).not.toContain(base.orderRefHash);
 });
 it('does not equate empty observation coverage with zero revenue',()=>{
  expect(summarizeJussPayObservations([],0)).toMatchObject({state:'no_observations',observedGrossMinor:null,netRevenueMinor:null,settlementVerified:false});
 });
 it('marks truncated input partial and denies malformed or conflicting payment identities',()=>{
  expect(summarizeJussPayObservations([base],501)).toMatchObject({partial:true,availableReceiptCount:501,observedGrossMinor:1000});
  expect(()=>summarizeJussPayObservations([{...base,email:'buyer@example.test'}],1)).toThrow();
  expect(()=>summarizeJussPayObservations([base,{...base,receiptId:'e'.repeat(64),grossMinor:2000}],2)).toThrow();
  expect(()=>summarizeJussPayObservations([base,base],2)).toThrow();
 });
});
