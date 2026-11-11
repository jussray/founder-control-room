import { describe, expect, it } from "vitest";
import {
  DESIGN_COMMAND_DECK_CONTRACT,
  DESIGN_COMMAND_SHARED_CAPABILITY,
  DESIGN_COMMANDS,
  getDesignCommand,
} from "./commands.js";

const EXPECTED_IDS = [
  "intent",
  "critique",
  "hierarchy",
  "flow",
  "information",
  "copy",
  "typeset",
  "layout",
  "spacing",
  "color",
  "components",
  "states",
  "forms",
  "responsive",
  "touch",
  "accessibility",
  "motion",
  "feedback",
  "empty",
  "recovery",
  "brand",
  "polish",
  "prove",
] as const;

describe("Project design command deck", () => {
  it("defines exactly the 23 bounded operations in canonical order", () => {
    expect(DESIGN_COMMAND_DECK_CONTRACT).toBe("juss/design-command-deck@v1");
    expect(DESIGN_COMMAND_SHARED_CAPABILITY).toBe("control-room-design-implementation");
    expect(DESIGN_COMMANDS.map((entry) => entry.id)).toEqual(EXPECTED_IDS);
    expect(new Set(DESIGN_COMMANDS.map((entry) => entry.id)).size).toBe(23);
    expect(DESIGN_COMMANDS.map((entry) => entry.slash)).toEqual(
      EXPECTED_IDS.map((id) => `/${id}`),
    );
  });

  it("requires founder approval and Playwright proof for every mutating operation", () => {
    const mutating = DESIGN_COMMANDS.filter((entry) => entry.mode === "mutate");

    expect(mutating.length).toBeGreaterThan(0);
    for (const entry of mutating) {
      expect(entry.requiresFounderApproval).toBe(true);
      expect(entry.requiresPlaywright).toBe(true);
      expect(entry.owns.length).toBeGreaterThan(10);
      expect(entry.forbids.length).toBeGreaterThan(10);
    }
  });

  it("keeps diagnosis observational and closure verification-only", () => {
    expect(getDesignCommand("intent")?.mode).toBe("observe");
    expect(getDesignCommand("critique")?.mode).toBe("observe");
    expect(getDesignCommand("prove")?.mode).toBe("verify");
    expect(getDesignCommand("prove")?.requiresFounderApproval).toBe(false);
    expect(getDesignCommand("prove")?.requiresPlaywright).toBe(true);
  });

  it("resolves slash-prefixed command ids without creating aliases outside the deck", () => {
    expect(getDesignCommand("/layout")?.id).toBe("layout");
    expect(getDesignCommand(" /RESPONSIVE ")?.id).toBe("responsive");
    expect(getDesignCommand("make-it-pretty")).toBeUndefined();
  });
});
