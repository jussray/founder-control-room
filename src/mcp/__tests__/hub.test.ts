import { describe, expect, it } from "vitest";
import { assertNoSecretArguments, requestHash } from "../safety.js";

describe("MCP evidence safety", () => {
  it("produces stable hashes regardless of object key order", () => {
    expect(requestHash({ b: 2, a: 1 })).toBe(requestHash({ a: 1, b: 2 }));
  });

  it("rejects secret-bearing argument keys", () => {
    expect(() =>
      assertNoSecretArguments({
        repository: "jussray/Sekret-Bip",
        nested: { apiKey: "never-send-this" },
      }),
    ).toThrow(/Secret-bearing argument key/);
  });

  it("allows ordinary read-only structural arguments", () => {
    expect(() =>
      assertNoSecretArguments({
        owner: "jussray",
        repo: "Sekret-Bip",
        query: "RoomBackground",
        ref: "main",
      }),
    ).not.toThrow();
  });
});
