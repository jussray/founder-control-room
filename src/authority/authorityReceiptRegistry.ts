import type { AuthorityReceipt } from "./authorityReceipt.js";

export type ReceiptConsumeResult =
  | { ok: true; receipt: AuthorityReceipt }
  | { ok: false; reason: "already_consumed" | "invalid_receipt" };

export class AuthorityReceiptRegistry {
  private readonly consumed = new Set<string>();

  consume(receipt: AuthorityReceipt): ReceiptConsumeResult {
    if (receipt.status !== "valid") {
      return { ok: false, reason: "invalid_receipt" };
    }

    if (this.consumed.has(receipt.id)) {
      return { ok: false, reason: "already_consumed" };
    }

    this.consumed.add(receipt.id);
    return { ok: true, receipt };
  }
}
