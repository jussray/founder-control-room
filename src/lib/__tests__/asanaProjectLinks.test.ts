import { describe, expect, it } from "vitest";
import { ASANA_PROJECT_LINKS, linkAsanaTask } from "../asanaProjectLinks.js";

describe("read-only Asana identity mapping", () => {
  it("links an existing task without granting release authority", () => {
    const linked = linkAsanaTask("founder-control-room", {
      gid: "1216469873781942",
      name: "Add integration tests",
      completed: true,
      modified_at: "2026-11-03T12:00:00Z",
    }, "2026-11-03T13:00:00Z");
    expect(linked.sourceProjectId).toBe("1216469762380974");
    expect(linked.sourceTaskId).toBe("1216469873781942");
    expect(linked.observedAt).toBe("2026-11-03T13:00:00Z");
    expect(linked.releaseAuthorized).toBe(false);
    expect(linked.authority).toBe("task-coordination-only");
    expect(linked.completed).toBe(true);
  });

  it("preserves unique existing project IDs", () => {
    expect(new Set(Object.values(ASANA_PROJECT_LINKS)).size).toBe(6);
  });

  it("rejects unauditable identities and observations", () => {
    expect(() => linkAsanaTask("sekret-bip", { gid: "invalid", name: "Task", completed: false }, "2026-11-03T13:00:00Z")).toThrow();
    expect(() => linkAsanaTask("sekret-bip", { gid: "123", name: "Task", completed: false }, "not-a-date")).toThrow();
    expect(() => linkAsanaTask("unknown-project" as "sekret-bip", { gid: "123", name: "Task", completed: false }, "2026-11-03T13:00:00Z")).toThrow("Unlinked FCR project");
  });
});
