import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { requireCsrf } from "./csrf.js";

function invoke(request: Partial<Request>) {
  const status = vi.fn().mockReturnThis();
  const json = vi.fn().mockReturnThis();
  const next = vi.fn() as unknown as NextFunction;
  const response = { status, json } as unknown as Response;
  requireCsrf(request as Request, response, next);
  return { status, json, next };
}

describe("cookie-session CSRF", () => {
  it("allows safe methods", () => {
    const result = invoke({ method: "GET", headers: {} });
    expect(result.next).toHaveBeenCalledOnce();
  });

  it("allows explicit bearer clients without ambient-cookie CSRF", () => {
    const result = invoke({
      method: "POST",
      headers: { authorization: "Bearer explicit-token" },
    });
    expect(result.next).toHaveBeenCalledOnce();
  });

  it("rejects a cookie-backed write without the matching header", () => {
    const result = invoke({
      method: "POST",
      headers: { cookie: "fcr_access=a; fcr_refresh=r; fcr_csrf=expected" },
    });
    expect(result.status).toHaveBeenCalledWith(403);
    expect(result.next).not.toHaveBeenCalled();
  });

  it("accepts the double-submit token when cookie and header match", () => {
    const result = invoke({
      method: "POST",
      headers: {
        cookie: "fcr_access=a; fcr_refresh=r; fcr_csrf=expected",
        "x-csrf-token": "expected",
      },
    });
    expect(result.next).toHaveBeenCalledOnce();
  });

  it("lets unauthenticated writes reach the route's auth guard", () => {
    const result = invoke({ method: "POST", headers: {} });
    expect(result.next).toHaveBeenCalledOnce();
  });
});
