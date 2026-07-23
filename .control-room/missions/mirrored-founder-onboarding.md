# Mirrored Founder Onboarding Mission

## Goal

Give Founder Control Room and Chief AI Machine one consistent onboarding state machine while preserving separate product and authority boundaries.

## Shared flow

1. Welcome
2. Account
3. Workspace
4. Connections
5. Authority review
6. Ready

## Boundaries

- Founder Control Room owns authenticated founder authority, execution, evidence, approvals, and rollback.
- Chief AI remains usable in local-first mode without GitHub, Google, Founder Control Room, or a model provider.
- Google Identity is optional and must use an official Google Identity Services-rendered button when configured.
- No browser-decoded Google credential grants repository, deployment, billing, or external-communication authority.
- No production deploy, secret change, DNS change, billing action, migration, force-push, or destructive write is authorized by this mission.

## Verification gate

The exact changed heads require focused contract tests, typecheck/lint/tests as applicable, and Playwright proof for welcome, sign-in fallback, workspace setup, completion, persistence, sign-out, and cache-clearing behavior before merge-ready status.
