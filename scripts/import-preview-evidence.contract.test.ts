import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "scripts/import-preview-evidence.mjs"),
  "utf8",
);
const packageJson = readFileSync(
  resolve(process.cwd(), "package.json"),
  "utf8",
);

describe("manual preview evidence importer", () => {
  it("always marks imported proof unsigned and manual", () => {
    expect(source).toContain('mode: "preview_branch_import"');
    expect(source).toContain("signature_verified: false");
    expect(source).toContain('evidenceKind: "manual_preview"');
    expect(source).toContain("signatureVerified: false");
  });

  it("verifies registry identity before evidence writes", () => {
    const lookup = source.indexOf("No registered project found");
    const mismatch = source.indexOf("Packet repository identity does not match");
    const runWrite = source.indexOf("/repository_verification_runs?on_conflict");
    expect(lookup).toBeGreaterThan(-1);
    expect(mismatch).toBeGreaterThan(lookup);
    expect(runWrite).toBeGreaterThan(mismatch);
  });

  it("does not create missions or perform repository/deployment actions", () => {
    expect(source).toContain("missionsCreated: 0");
    expect(source).not.toContain('/missions?');
    expect(source).not.toContain("createBranch");
    expect(source).not.toContain("integrate(");
    expect(source).not.toContain("deploy(");
    expect(source).not.toContain("rollback(");
  });

  it("requires explicit finding fingerprints before resolving anything", () => {
    expect(source).toContain("resolvedFindingFingerprints");
    expect(source).toContain("cannot be both active and resolved");
    expect(source).not.toContain("activeFingerprints.includes");
    expect(source).toContain("findingsExplicitlyResolved");
  });

  it("accepts assertion IDs but no usage marker or source-content field", () => {
    expect(source).toContain("usageAssertionIds");
    expect(source).toContain("failedUsageAssertionIds");
    expect(source).not.toContain("usageMarker");
    expect(source).not.toContain("sourceContent");
  });

  it("is exposed through an explicit npm command", () => {
    expect(packageJson).toContain('"preview:evidence": "node scripts/import-preview-evidence.mjs"');
  });
});
