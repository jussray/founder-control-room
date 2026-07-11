import type { NextFunction, Request, Response } from "express";
import { supabaseAuth } from "../../lib/supabaseAuthClient.js";
import { supabase } from "../../lib/supabaseClient.js";

export interface FounderRequest extends Request {
  founder?: { email: string; userId: string };
}

/**
 * L99: "Read project" is allowed during discussion, but "discussion" still
 * means the founder, not the public internet. Every route behind this
 * middleware requires:
 *   1. A valid Supabase session JWT (proves the magic-link sign-in happened)
 *   2. That JWT's email being present in `founder_users` (checked with the
 *      service-role client, since founder_users has no anon/authenticated
 *      policy — the allowlist itself is never client-readable).
 *
 * This is deliberately redundant with the RLS `founder_full_access` policy:
 * this middleware guards the HTTP route, RLS guards the row, in case some
 * future code path ever queries the DB directly with a user session token
 * instead of the service role key.
 */
export async function requireFounder(
  req: FounderRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  const { data: userData, error: userError } = await supabaseAuth.auth.getUser(
    token
  );
  if (userError || !userData?.user?.email) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  const email = userData.user.email;

  const { data: allowRow, error: allowError } = await supabase
    .from("founder_users")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (allowError) {
    return res.status(500).json({ error: "Founder allowlist check failed" });
  }
  if (!allowRow) {
    return res.status(403).json({ error: "Not on the founder allowlist" });
  }

  req.founder = { email, userId: userData.user.id };
  next();
}
