import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createJussPayReceiptHandler, type JussPayReceiptStore } from '../jusspayReceipts.js';

const key='x'.repeat(48);
const receipt={schema:'jusspay/commerce-receipt@v1',receiptId:'a'.repeat(64),orderRefHash:'b'.repeat(64),product:'jbh',mode:'live',event:'payment_recorded',grossMinor:1000,currency:'usd',occurredAt:'2026-11-27T13:00:00.000Z',releaseSha:'c'.repeat(40)};
const app=(store:JussPayReceiptStore,secret:string|undefined=key)=>{
  const a=express();a.use(express.json({limit:'8kb'}));
  a.post('/ingest/jusspay-receipts',createJussPayReceiptHandler(store,()=>secret));return a;
};
describe('JussPay receipt ingress',()=>{
  it('authenticates independently and denies unknown/private fields',async()=>{
    const store=vi.fn<JussPayReceiptStore>();
    expect((await request(app(store)).post('/ingest/jusspay-receipts').send(receipt)).status).toBe(401);
    expect((await request(app(store,'')).post('/ingest/jusspay-receipts').set('x-jusspay-receipt-key',key).send(receipt)).status).toBe(503);
    for(const change of [{email:'buyer@example.test'},{mode:'test'},{grossMinor:-1},{currency:'eur'},{releaseSha:'main'},{event:'refund_hold',grossMinor:1000}]){
      expect((await request(app(store)).post('/ingest/jusspay-receipts').set('x-jusspay-receipt-key',key).send({...receipt,...change})).status).toBe(400);
    }
    expect(store).not.toHaveBeenCalled();
  });
  it('acknowledges only durable storage and refuses immutable receipt conflicts',async()=>{
    const store=vi.fn<JussPayReceiptStore>().mockResolvedValueOnce('stored').mockResolvedValueOnce('duplicate').mockResolvedValueOnce('conflict').mockRejectedValueOnce(new Error('unavailable'));
    for(const expected of [201,200,409,503]){
      const r=await request(app(store)).post('/ingest/jusspay-receipts').set('x-jusspay-receipt-key',key).send(receipt);
      expect(r.status).toBe(expected);
      if(expected<300)expect(r.body).toMatchObject({accepted:true,receiptId:receipt.receiptId});
    }
    expect(store).toHaveBeenCalledWith(receipt);
  });
});
