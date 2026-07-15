import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import {
  clearFounderSessionCookies,
  readFounderSessionCookies,
  setFounderSessionCookies,
} from "./sessionCookies.js";

function fakeResponse() {
  const cookies: string[] = [];
  const headers = new Map<string, string>();
  return {
    cookies,
    headers,
    response: {
      append: vi.fn((_name: string, value: string) => {
        cookies.push(value);
      }),
      setHeader: vi.fn((name: string, value: string) => {
        headers.set(name, value);
      }),
    } as unknown as Response,
  };
}

describe("founder session cookies", () => {
  it("stores access and refresh tokens as HttpOnly and exposes only random CSRF", () => {
    const { response, cookies, headers } = fakeResponse();
    const csrf = setFounderSessionCookies(response, {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });

    expect(csrf).toMatch(/^[a-f0-9]{64}$/);
    expect(cookies).toHaveLength(3);
    expect(cookies[0]).toContain("fcr_access=access-token");
    expect(cookies[0]).toContain("HttpOnly");
    expect(cookies[1]).toContain("fcr_refresh=refresh-token");
    expect(cookies[1]).toContain("HttpOnly");
    expect(cookies[2]).toContain(`fcr_csrf=${csrf}`);
    expect(cookies[2]).not.toContain("HttpOnly");
    expect(cookies.every((cookie) => cookie.includes("SameSite=Lax"))).toBe(true);
    expect(headers.get("Cache-Control")).toBe("no-store");
  });

  it("reads encoded cookie values without exposing malformed cookies", () => {
    const request = {
      headers: {
        cookie: "bad=%E0%A4%A; fcr_access=a%20b; fcr_refresh=r; fcr_csrf=c",
      },
    } as unknown as Request;

    expect(readFounderSessionCookies(request)).toEqual({
      accessToken: "a b",
      refreshToken: "r",
      csrfToken: "c",
    });
  });

  it("expires every founder cookie on logout", () => {
    const { response, cookies } = fakeResponse();
    clearFounderSessionCookies(response);
    expect(cookies).toHaveLength(3);
    expect(cookies.every((cookie) => cookie.includes("Max-Age=0"))).toBe(true);
  });
});
