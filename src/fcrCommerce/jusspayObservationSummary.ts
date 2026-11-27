import { parseJussPayReceipt } from '../http/routes/jusspayReceipts.js';

export function summarizeJussPayObservations(payloads: unknown[], availableReceiptCount: number) {
  if (!Number.isSafeInteger(availableReceiptCount) || availableReceiptCount < payloads.length || payloads.length > 500) throw Error('invalid_receipt_coverage');
  const seen = new Set<string>();
  const buckets = new Map<string,{product:string;observedGrossMinor:number;paid:Set<string>;refunds:Set<string>;disputes:Set<string>}>();
  let newestObservedAt: string | null = null;
  for (const payload of payloads) {
    const r = parseJussPayReceipt(payload);
    if (!r || seen.has(r.receiptId)) throw Error('invalid_receipt_ledger');
    seen.add(r.receiptId);
    if (newestObservedAt === null || r.occurredAt > newestObservedAt) newestObservedAt = r.occurredAt;
    const b = buckets.get(r.product) ?? {product:r.product,observedGrossMinor:0,paid:new Set<string>(),refunds:new Set<string>(),disputes:new Set<string>()};
    if (r.event === 'payment_recorded') {
      if (b.paid.has(r.orderRefHash) || r.grossMinor === null) throw Error('conflicting_payment_observation');
      b.paid.add(r.orderRefHash); b.observedGrossMinor += r.grossMinor;
    } else if (r.event === 'refund_hold') b.refunds.add(r.orderRefHash);
    else if (r.event === 'dispute_hold') b.disputes.add(r.orderRefHash);
    buckets.set(r.product,b);
  }
  const byProduct = [...buckets.values()].map(b => ({
    product:b.product, observedGrossMinor:b.paid.size ? b.observedGrossMinor : null,
    paymentOrders:b.paid.size, refundHoldOrders:b.refunds.size, disputeHoldOrders:b.disputes.size
  })).sort((a,b)=>a.product.localeCompare(b.product));
  const paymentOrders=byProduct.reduce((n,b)=>n+b.paymentOrders,0);
  return {
    state:payloads.length?'observed':'no_observations',
    scope:'latest_ingested_receipts',currency:'usd',receiptCount:payloads.length,availableReceiptCount,
    partial:availableReceiptCount>payloads.length,newestObservedAt,
    observedGrossMinor:paymentOrders?byProduct.reduce((n,b)=>n+(b.observedGrossMinor??0),0):null,
    paymentOrders,refundHoldOrders:byProduct.reduce((n,b)=>n+b.refundHoldOrders,0),
    disputeHoldOrders:byProduct.reduce((n,b)=>n+b.disputeHoldOrders,0),
    netRevenueMinor:null,settlementVerified:false,byProduct,
  };
}
