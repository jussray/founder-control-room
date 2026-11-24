import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { FOUNDER_API_URL } from "./security.js";

export const ACCESS_COOKIE = "fcr_access";
export const REFRESH_COOKIE = "fcr_refresh";
export const CSRF_COOKIE = "fcr_csrf";

const COOKIE_SECURE = new URL(FOUNDER_API_URL).protocol === "https:";
const REFRESH_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export interface FounderSessionCookies {
  accessToken: string | null;
  refreshToken: string | null;
  csrfToken: string | null;
}

function parseCookieHeader(header: string | undefined): Map<string, string> {
  const result = new Map<string, string>();
  if (!header) return result;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    try {
      result.set(name, decodeURIComponent(rawValue));
    } catch {
      // Malformed cookie values are ignored instead of crashing auth.
    }
  }
  return result;
}

function serializeCookie(
  name: string,
  value: string,
  options: {
    maxAge: number;
    httpOnly: boolean;
  },
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${Math.max(0, Math.floor(options.maxAge))}`,
    "SameSite=Lax",
  ];
  if (options.httpOnly) parts.push("HttpOnly");
  if (COOKIE_SECURE) parts.push("Secure");
  return parts.join("; ");
}

function appendCookie(res: Response, value: string): void {
  res.append("Set-Cookie", value);
}

export function readFounderSessionCookies(req: Request): FounderSessionCookies {
  const cookies = parseCookieHeader(req.headers.cookie);
  return {
    accessToken: cookies.get(ACCESS_COOKIE) ?? null,
    refreshToken: cookies.get(REFRESH_COOKIE) ?? null,
    csrfToken: cookies.get(CSRF_COOKIE) ?? null,
  };
}

export function setFounderSessionCookies(
  res: Response,
  session: {
    accessToken: string;
    refreshToken: string;
    expiresAt?: number | null;
  },
): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const accessMaxAge = Math.max(60, (session.expiresAt ?? nowSeconds + 3600) - nowSeconds);
  const csrfToken = randomBytes(32).toString("hex");

  appendCookie(res, serializeCookie(ACCESS_COOKIE, session.accessToken, {
    maxAge: accessMaxAge,
    httpOnly: true,
  }));
  appendCookie(res, serializeCookie(REFRESH_COOKIE, session.refreshToken, {
    maxAge: REFRESH_MAX_AGE_SECONDS,
    httpOnly: true,
  }));
  appendCookie(res, serializeCookie(CSRF_COOKIE, csrfToken, {
    maxAge: REFRESH_MAX_AGE_SECONDS,
    httpOnly: false,
  }));
  res.setHeader("Cache-Control", "no-store");
  return csrfToken;
}

export function clearFounderSessionCookies(res: Response): void {
  for (const [name, httpOnly] of [
    [ACCESS_COOKIE, true],
    [REFRESH_COOKIE, true],
    [CSRF_COOKIE, false],
  ] as const) {
    appendCookie(res, serializeCookie(name, "", { maxAge: 0, httpOnly }));
  }
  res.setHeader("Cache-Control", "no-store");
}
