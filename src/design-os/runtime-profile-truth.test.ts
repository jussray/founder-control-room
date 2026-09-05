import { describe, expect, it } from "vitest";
import { getDesignOsProject } from "./registry.js";

describe("Portfolio Design OS runtime profile truth", () => {
  it("records Bip as a multi-surface app with a real Python voice service", () => {
    const profile = getDesignOsProject("sekret-bip")?.runtimeProfile ?? "";

    expect(profile).toContain("Expo Router");
    expect(profile).toContain("React Native/Web");
    expect(profile).toContain("Cloudflare Workers/Pages");
    expect(profile).toContain("Python/FastAPI Piper TTS service");
  });

  it("records StoryEngine's actual Node and SQLite runtime", () => {
    const profile = getDesignOsProject("l99-story-engine")?.runtimeProfile ?? "";

    expect(profile).toContain("Node.js");
    expect(profile).toContain("node:sqlite");
  });

  it("does not regress Chief to a frontend-only prototype description", () => {
    const profile = getDesignOsProject("chief-ai-machine")?.runtimeProfile ?? "";

    expect(profile).toContain("Cloudflare Worker backend");
    expect(profile).toContain("MCP");
    expect(profile).toContain("exact-release identity");
    expect(profile).not.toContain("backend capabilities remain planned");
  });
});
