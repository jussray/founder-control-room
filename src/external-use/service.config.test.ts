import { afterEach, describe, expect, it, vi } from "vitest";

const { from } = vi.hoisted(() => ({
  from: vi.fn(() => {
    throw new Error("unexpected_digest_reservation");
  }),
}));

vi.mock("../lib/supabaseClient.js", () => ({ supabase: { from } }));

import { runExternalUseHourlyCycle } from "./service.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  from.mockClear();
});

describe("external-use hourly digest runtime readiness", () => {
  it.each([
    { key: "", sender: "" },
    { key: "test-only-key", sender: "" },
    { key: "", sender: "sender@example.invalid" },
    { key: "   ", sender: "sender@example.invalid" },
    { key: "test-only-key", sender: "   " },
  ])("skips missing optional delivery configuration without reserving a digest", async ({ key, sender }) => {
    vi.stubEnv("RESEND_API_KEY", key);
    vi.stubEnv("EXTERNAL_USE_EMAIL_FROM", sender);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(runExternalUseHourlyCycle(new Date("2026-11-18T20:00:00.000Z")))
      .resolves.toEqual({ status: "skipped", reason: "delivery_not_configured" });
    expect(from).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(JSON.stringify({
      task: "external-use",
      status: "skipped",
      reason: "delivery_not_configured",
    }));
  });

  it("preserves the reservation path once the sender and key are configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-only-key");
    vi.stubEnv("EXTERNAL_USE_EMAIL_FROM", "sender@example.invalid");

    await expect(runExternalUseHourlyCycle(new Date("2026-11-18T20:00:00.000Z")))
      .rejects.toThrow("unexpected_digest_reservation");
    expect(from).toHaveBeenCalledWith("external_code_use_digest_runs");
  });
});
