# L99 Interactive Authority Boundary

Terminal and browser access are explicit capabilities, not ambient agent powers.

- `terminal.read`: inspect bounded command output or files without mutation.
- `terminal.exec`: execute only an explicit command allowlist inside an approved target scope.
- `browser.open`: open/navigate only; it never carries external mutation authority.
- `browser.read`: inspect rendered state.
- `browser.interact`: bounded UI interaction; UI/runtime claims require Playwright proof.
- `browser.external_mutation`: submit/send/publish/purchase or another external side effect; requires a founder-bound receipt and exact action binding.

n8n may coordinate these capabilities but cannot widen them. A workflow, prompt, MCP handle, terminal route, browser session, or Playwright session is not an authorization grant by itself.

The later execution integration must reread authoritative policy/approval state immediately before any external side effect and must preserve the exact target, operation, expiry, and action hash approved upstream.
