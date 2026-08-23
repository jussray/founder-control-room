import { validateAuthorityReceipt } from "./authorityReceipt.js";
import type { AuthorityReceipt } from "./authorityReceipt.js";

export type ReceiptConsumeResult =
  | { ok: true; receipt: AuthorityReceipt }
  | {
      ok: false;
      reason:
        | "already_consumed"
        | "invalid_receipt"
        | "expired"
        | "missing_evidence"
        | "invalid_digest"
        | "missing_action_binding"
        | "missing_target_binding";
    };

export class AuthorityReceiptRegistry {
  private readonly consumed = new Set<string>();

  consume(receipt: AuthorityReceipt): ReceiptConsumeResult {
    const validation = validateAuthorityReceipt(receipt);

    if (!validation.ok) {
      return validation;
    }

    if (this.consumed.has(receipt.id)) {
      return { ok: false, reason: "already_consumed" };
    }

    this.consumed.add(receipt.id);

    return {
      ok: true,
      receipt: {
        ...receipt,
        consumedAt: new Date().toISOString(),
        status: "consumed",
      },
    };
  }
}
