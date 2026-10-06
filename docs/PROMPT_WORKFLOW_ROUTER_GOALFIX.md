# Goalfix — Prompt Workflow Router

Authoritative repo: `jussray/founder-control-room`
Target branch: `feat/prompt-workflow-router`
Goal: turn approved prompt workflows into deterministic FCR routing without widening authority.
Suspected failure area: runtime server mount.
Exact source needed: `src/http/server.ts`, route module, selector, authority registry, focused tests.
Stop condition: route mounted behind existing mutation/security gates; focused tests/CI green; exact deployed SHA proven with Playwright.

Do not create another prompt system, event bus, database schema, or authority path.
