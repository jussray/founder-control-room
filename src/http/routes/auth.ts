import { Router } from "express";
import { supabaseAuth } from "../../lib/supabaseAuthClient.js";
import { supabase } from "../../lib/supabaseClient.js";

export const authRouter = Router();

const FOUNDER_APP_URL = process.env.FOUNDER_APP_URL ?? "http://localhost:8787";

/**
 * POST /auth/magic-link
 * Body: { "email": "founder@example.com" }
 *
 * Sends a Supabase magic link to `email`, but only if it's on the founder
 * allowlist. Responds with the same generic message either way, so this
 * endpoint can't be used to probe which emails are founders.
 */
authRouter.post("/magic-link", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  if (!email) {
    return res.status(400).json({ error: "email is required" });
  }

  const { data: allowRow } = await supabase
    .from("founder_users")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (allowRow) {
    const { error } = await supabaseAuth.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${FOUNDER_APP_URL}/auth/callback`,
      },
    });
    if (error) {
      // Log server-side, but still return the generic response to the caller.
      console.error("signInWithOtp failed:", error.message);
    }
  }

  return res.status(202).json({
    message: "If this email is on the founder allowlist, a magic link has been sent.",
  });
});

/**
 * GET /auth/callback?token_hash=...&type=magiclink
 *
 * The founder's mail client hits this after clicking the emailed link
 * (Supabase's PKCE/token-hash flow — no password, no long-lived link
 * secret sitting in an inbox forever). On success, returns a session
 * (access_token / refresh_token) the founder uses as a Bearer token on
 * every `requireFounder`-protected route.
 *
 * This intentionally returns JSON, not a redirect — there's no Control
 * Room frontend wired up yet. Once one exists, swap this for a redirect
 * that hands the session to the frontend instead.
 */
authRouter.get("/callback", async (req, res) => {
  const tokenHash = typeof req.query.token_hash === "string" ? req.query.token_hash : null;
  const type = typeof req.query.type === "string" ? req.query.type : "magiclink";

  if (!tokenHash) {
    return res.status(400).json({ error: "token_hash is required" });
  }

  const { data, error } = await supabaseAuth.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as "magiclink" | "email",
  });

  if (error || !data.session || !data.user?.email) {
    return res.status(401).json({ error: error?.message ?? "Verification failed" });
  }

  // Defense in depth: re-check the allowlist even though only allowlisted
  // emails were ever sent a link.
  const { data: allowRow } = await supabase
    .from("founder_users")
    .select("email")
    .eq("email", data.user.email)
    .maybeSingle();

  if (!allowRow) {
    await supabaseAuth.auth.signOut();
    return res.status(403).json({ error: "Not on the founder allowlist" });
  }

  return res.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    founder: { email: data.user.email },
  });
});
