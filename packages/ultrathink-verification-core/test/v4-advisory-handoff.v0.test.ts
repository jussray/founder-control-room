import { describe, expect, it } from "vitest";
import { createV4AdvisoryHandoffV0 } from "../src/v4-advisory-handoff.v0";

const subjectHash = "a".repeat(64);
const observationHash = "b".repeat(64);

describe("V4 advisory handoff", () => {
  it("is deterministic, sanitized, and capped at ATTESTED", () => {
    const first = createV4AdvisoryHandoffV0({ subjectHash, observationHash });
    const second = createV4AdvisoryHandoffV0({ subjectHash, observationHash });

    expect(first).toEqual(second);
    expect(first.evidenceLevel).toBe("ATTESTED");
    expect(Object.keys(first).sort()).toEqual(
      ["evidenceLevel", "learningHash", "observationHash", "schema", "subjectHash"].sort(),
    );
    expect(first.learningHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects non-digest inputs instead of laundering raw evidence", () => {
    expect(() =>
      createV4AdvisoryHandoffV0({
        subjectHash: "raw source bytes",
        observationHash,
      }),
    ).toThrow(/subjectHash/);
  });
});
