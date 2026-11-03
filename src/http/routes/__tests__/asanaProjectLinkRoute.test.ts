import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [{ id: "fcr-1", slug: "founder-control-room" }],
  error: null as null | { message: string },
  queries: [] as Array<{ table: string; slug: string }>,
}));

vi.mock("../../middleware/requireFounder.js", () => ({
  requireFounder: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../../../providers/providerFactory.js", () => ({
  providerForProject: vi.fn(),
}));
vi.mock("../../../lib/supabaseClient.js", () => ({
  supabase: {
    from: (table: string) => ({
      select: (_columns: string) => ({
        eq: (_field: string, slug: string) => ({
          maybeSingle: async () => {
            state.queries.push({ table, slug });
            return { data: state.rows.find(row => row.slug === slug) ?? null, error: state.error };
          },
        }),
      }),
    }),
  },
}));

import { projectsRouter } from "../projects.js";

const app = express();
app.use("/projects", projectsRouter);

beforeEach(() => {
  state.rows = [{ id: "fcr-1", slug: "founder-control-room" }];
  state.error = null;
  state.queries = [];
});

describe("read-only Asana project link route", () => {
  it("returns the existing project's Asana identity without release authority", async () => {
    const response = await request(app).get("/projects/founder-control-room/asana-link");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      fcrProjectId: "fcr-1",
      fcrProjectSlug: "founder-control-room",
      asanaProjectId: "1216469762380974",
      source: "asana",
      mode: "read-only",
      releaseAuthorized: false,
      taskState: "not-fetched",
    });
    expect(state.queries).toEqual([{ table: "projects", slug: "founder-control-room" }]);
  });

  it("rejects unlinked slugs before querying project data", async () => {
    const response = await request(app).get("/projects/unknown-project/asana-link");
    expect(response.status).toBe(404);
    expect(state.queries).toEqual([]);
  });

  it("does not invent a link for an unregistered FCR project", async () => {
    state.rows = [];
    const response = await request(app).get("/projects/sekret-bip/asana-link");
    expect(response.status).toBe(404);
  });

  it("fails closed when the registry lookup fails", async () => {
    state.error = { message: "registry unavailable" };
    const response = await request(app).get("/projects/founder-control-room/asana-link");
    expect(response.status).toBe(500);
  });
});
