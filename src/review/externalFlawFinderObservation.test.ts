import { describe, expect, it } from "vitest";
import {
  EXTERNAL_FLAW_FINDER_OBSERVATION_CONTRACT,
  REQUIRED_FLAW_FINDER_ATTACKS,
  SOFA_FLAW_FINDER_PROVIDER,
  SOFA_FLAW_FINDER_REVIEWER_ID,
  externalFlawFinderObservationHash,
  externalFlawFinderSourceFingerprint,
  validateExternalFlawFinderObservation,
  type ExternalFlawFinderObservation,
} from "./externalFlawFinderObservation.js";

const REPOSITORY = "jussray/founder-control-room";
const BRANCH = "fix/sofa-flaw-finder-review-lane";
const HEAD = "a".repeat(40);
const OBSERVED_AT = "2026-09-24T05:00:00.000Z";
const EXPIRES_AT = "2026-09-25T05:00:00.000Z";

function observation(): ExternalFlawFinderObservation {
  const sourceRef = "sofa://flaw-finder/draft/example";
  const draft = {
    contract: EXTERNAL_FLAW_FINDER_OBSERVATION_CONTRACT,
    provider: SOFA_FLAW_FINDER_PROVIDER,
    reviewerId: SOFA_FLAW_FINDER_REVIEWER_ID,
    repository: REPOSITORY,
    branch: BRANCH,
    headSha: HEAD,
    sourceRef,
    sourceFingerprint: externalFlawFinderSourceFingerprint(REPOSITORY, BRANCH, HEAD, sourceRef),
    observedAt: OBSERVED_AT,
    expiresAt: EXPIRES_AT,
    attacksRun: [...REQUIRED_FLAW_FINDER_ATTACKS],
    findings: [
      {
        id: "finding-1",
        severity: "P2" as const,
        truthState: "VERIFIED" as const,
        claim: "A reviewed claim overstates what the available evidence proves.",
        trueBaseline: "The exact head contains source-level evidence only.",
        evidence: ["repo:commit:a"],
        contradiction: "No runtime receipt is attached.",
        recommendation: "Narrow the claim until runtime evidence exists.",
        rollback: "Remove the draft observation; it carries no execution authority.",
        nextProofGate: "Obtain exact-head runtime or browser evidence.",
      },
    ],
    publicationMode: "draft_only" as const,
    proposalOnly: true as const,
    countsAsIndependentReview: false as const,
    authority: {
      externalWrite: false as const,
      merge: false as const,
      deploy: false as const,
      publish: false as const,
      providerMutation: false as const,
      registryPromotion: false as const,
    },
  };

  return {
    ...draft,
    observationHash: externalFlawFinderObservationHash(draft),
  };
}

describe("SOFA Flaw Finder external observation contract", () => {
  it("accepts a fresh exact-head draft observation that ran every attack flow", () => {
    expect(validateExternalFlawFinderObservation(observation(), Date.parse(OBSERVED_AT) + 1_000)).toEqual([]);
  });

  it("fails closed when self-attack is skipped", () => {
    const candidate = observation();
    candidate.attacksRun = candidate.attacksRun.filter((attack) => attack !== "self_attack");

    expect(validateExternalFlawFinderObservation(candidate, Date.parse(OBSERVED_AT) + 1_000))
      .toContain("Required attack was not run: self_attack");
  });

  it("fails closed when the observation becomes stale", () => {
    expect(validateExternalFlawFinderObservation(observation(), Date.parse(EXPIRES_AT)))
      .toContain("Flaw Finder observation is stale");
  });

  it("cannot carry publish, merge, execution, provider mutation, or registry-promotion authority", () => {
    const candidate = observation() as ExternalFlawFinderObservation & {
      authority: ExternalFlawFinderObservation["authority"] & { publish: boolean };
    };
    candidate.authority.publish = true;

    expect(validateExternalFlawFinderObservation(candidate, Date.parse(OBSERVED_AT) + 1_000))
      .toContain("Flaw Finder observation cannot carry mutation or promotion authority");
  });

  it("does not become an independent review receipt merely because SOFA produced it", () => {
    const candidate = observation() as ExternalFlawFinderObservation & { countsAsIndependentReview: boolean };
    candidate.countsAsIndependentReview = true;

    expect(validateExternalFlawFinderObservation(candidate, Date.parse(OBSERVED_AT) + 1_000))
      .toContain("SOFA observation cannot satisfy independent review by itself");
  });

  it("detects source or finding tampering through fingerprints and the observation hash", () => {
    const sourceTampered = observation();
    sourceTampered.headSha = "b".repeat(40);
    expect(validateExternalFlawFinderObservation(sourceTampered, Date.parse(OBSERVED_AT) + 1_000))
      .toContain("sourceFingerprint does not match source identity");

    const findingTampered = observation();
    findingTampered.findings[0]!.claim = "Tampered claim";
    expect(validateExternalFlawFinderObservation(findingTampered, Date.parse(OBSERVED_AT) + 1_000))
      .toContain("observationHash does not match observation content");
  });
});
