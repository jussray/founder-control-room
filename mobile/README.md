# Founder Control Room Mobile

This directory is the native iOS/Android founder client for the existing Founder Control Room authority.

## Product job

Mobile v1 is a read-first mission-control surface. It:

- signs in through the existing Supabase Auth identity;
- stores the mobile session with Expo SecureStore;
- sends the Supabase access token as the existing API-client Bearer transport;
- relies on FCR's existing `requireFounder` middleware and `founder_users` allowlist;
- reads `/dashboard/tasks`, `/dashboard/activity`, `/dashboard/costs`, and `/dashboard/proof-engine`;
- adds native pull-to-refresh, haptic feedback, and bounded proof-snapshot sharing.

It does not create a second FCR backend, second task store, second proof engine, or second authority model.

## High-consequence authority boundary

FCR already separates ordinary API-client Bearer identity from `requireInteractiveFounder`, which requires the current opaque interactive founder capability for high-consequence decisions.

Mobile v1 therefore does **not** call manual analysis, approval mutation, merge, deploy, publish, spend, delete, or equivalent execution surfaces. A mobile observation or shared proof snapshot cannot manufacture founder approval or reusable execution authority.

## Store truth states

- `SOURCE IMPLEMENTED`: Expo source, secure auth adapter, existing read-model integration, native utility, store identifiers, and build profiles exist.
- `CI VERIFIED`: exact-head contract tests, TypeScript, Android export, and iOS export pass.
- `NATIVE BUILD VERIFIED`: requires a reviewable/signed `.aab` / iOS build or equivalent provider build receipt.
- `DEVICE VERIFIED`: requires the installed application to pass the real founder sign-in and dashboard read path on target mobile devices.
- `STORE SUBMITTED`: requires an App Store Connect / Google Play Console submission receipt.
- `STORE APPROVED`: requires provider approval evidence.

Source or JavaScript export success alone must never be promoted to a signed-build, device, submission, or approval claim.

## Required public runtime configuration

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_FCR_ORIGIN`

These identify public client endpoints/configuration only. No service-role key, refresh token, Apple signing credential, Google service-account file, EAS credential, or store-account secret belongs in the repository.

## Rollback

The client is isolated under `mobile/` plus its dedicated mobile workflow. Reverting the mobile lane removes the store carrier without changing the existing Founder Control Room API, browser UI, approval model, deployment authority, or Supabase schema.
