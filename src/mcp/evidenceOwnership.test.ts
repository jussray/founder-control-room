import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  projects: [] as Array<Record<string, unknown>>,
  missions: [] as Array<Record<string, unknown>>,
  approvals: [] as Array<Record<string, unknown>>,
  change_proposals: [] as Array<Record<string, unknown>>,
}));

vi.mock("../lib/supabaseClient.js", () => ({
  supabase: {
    from(table: keyof typeof database) {
      return {
        select() {
          let filterColumn = "";
          let filterValue: unknown;
          const query = {
            eq(column: string, value: unknown) {
              filterColumn = column;
              filterValue = value;
              return query;
            },
            async maybeSingle() {
              const row = database[table].find(
                (candidate) => candidate[filterColumn] === filterValue,
              );
              return { data: row ?? null, error: null };
            },
          };
          return query;
        },
        async insert() {
          return { error: null };
        },
      };
    },
  },
}));

import { validateEvidenceReferences } from "./hub.js";

const PROJECT_A = "11111111-1111-4111-8111-111111111111";
const PROJECT_B = "22222222-2222-4222-8222-222222222222";
const MISSION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MISSION_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROPOSAL_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PROPOSAL_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const APPROVAL_A = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const APPROVAL_B = "ffffffff-ffff-4fff-8fff-ffffffffffff";

beforeEach(() => {
  database.projects.splice(0, database.projects.length,
    { id: PROJECT_A, slug: "project-a" },
    { id: PROJECT_B, slug: "project-b" },
  );
  database.missions.splice(0, database.missions.length,
    { id: MISSION_A, project_id: PROJECT_A },
    { id: MISSION_B, project_id: PROJECT_B },
  );
  database.change_proposals.splice(0, database.change_proposals.length,
    { id: PROPOSAL_A, project_id: PROJECT_A, mission_id: MISSION_A },
    { id: PROPOSAL_B, project_id: PROJECT_B, mission_id: MISSION_B },
  );
  database.approvals.splice(0, database.approvals.length,
    {
      id: APPROVAL_A,
      mission_id: null,
      change_proposal_id: PROPOSAL_A,
    },
    {
      id: APPROVAL_B,
      mission_id: null,
      change_proposal_id: PROPOSAL_B,
    },
  );
});

describe("validateEvidenceReferences", () => {
  it("accepts a mission and approval whose complete lineage belongs to the project", async () => {
    await expect(
      validateEvidenceReferences("project-a", MISSION_A, APPROVAL_A),
    ).resolves.toBe(PROJECT_A);
  });

  it("rejects a mission from another project", async () => {
    await expect(
      validateEvidenceReferences("project-a", MISSION_B),
    ).rejects.toThrow(/does not belong to the requested project/);
  });

  it("rejects an approval whose change proposal belongs to another project", async () => {
    await expect(
      validateEvidenceReferences("project-a", undefined, APPROVAL_B),
    ).rejects.toThrow(/does not belong to the requested project/);
  });

  it("rejects an approval that does not belong to the supplied mission", async () => {
    database.approvals.push({
      id: "99999999-9999-4999-8999-999999999999",
      mission_id: MISSION_B,
      change_proposal_id: null,
    });

    await expect(
      validateEvidenceReferences(
        "project-b",
        MISSION_B,
        APPROVAL_A,
      ),
    ).rejects.toThrow(/does not belong to the requested project/);
  });

  it("rejects approvals with no project-verifiable lineage", async () => {
    const orphanApproval = "77777777-7777-4777-8777-777777777777";
    database.approvals.push({
      id: orphanApproval,
      mission_id: null,
      change_proposal_id: null,
    });

    await expect(
      validateEvidenceReferences("project-a", undefined, orphanApproval),
    ).rejects.toThrow(/no project-verifiable mission or change proposal/);
  });
});
