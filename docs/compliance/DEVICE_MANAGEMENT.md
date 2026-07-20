# Device Management

> **Founder Control Room** — Device Management Proof Document  
> Last updated: 2026-07-19

## 1. Session & Device Tracking
- Each authenticated session is associated with a `device_fingerprint` (user-agent + platform hash) stored in the `sessions` table.
- Supabase Auth tracks active sessions per user; the FCR UI surfaces these in **Settings → Security → Active Sessions**.

## 2. Multi-Device Policy
- Concurrent sessions across devices are allowed by default.
- Single-device mode can be enforced via `MAX_SESSIONS_PER_USER=1` in environment config; older sessions are revoked automatically.

## 3. Remote Session Revocation
```typescript
// Revoke a specific session
await supabase.auth.admin.signOut(sessionId, 'local');
// Revoke ALL sessions for a user (e.g., stolen device)
await supabase.auth.admin.signOut(userId, 'global');
```

## 4. Trusted Device Flow
1. First login from a new device triggers an email verification challenge.
2. Verified devices are stored in `trusted_devices` table (device_id, user_id, verified_at, last_seen).
3. Devices not seen in 90 days are automatically removed.

## 5. Mobile App Considerations
- Biometric lock (Face ID / Touch ID) is enforced at the app layer via the platform secure enclave.
- Push notification tokens are stored encrypted in Supabase Vault, never in plaintext columns.
- Device tokens are invalidated and deleted when a session is revoked or the account is deleted.

## 6. Cloudflare Bot & Device Signals
- Cloudflare Turnstile is used on auth endpoints to distinguish human from automated device access.
- `CF-Device-Type` header is logged for anomaly detection.
