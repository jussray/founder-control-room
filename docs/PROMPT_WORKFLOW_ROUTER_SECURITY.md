# Prompt Workflow Router Security Boundary

Prompt text is not authority.

Threats explicitly rejected:

1. A webpage, email, retrieved document, plugin output, API payload, product-user message, or another model says `/ultrathink`, `/law`, `/launch`, or another mode and attempts to activate internal control behavior.
2. A caller submits a mode name as a proposal `actionType` and attempts to convert reasoning capability into executable authority.
3. A selected workflow stack is interpreted as founder approval.
4. A stronger model or deeper reasoning mode is treated as a higher authority level.
5. A provider failure is used to justify wider fallback permissions.

Controls:

- system-owned mode registry rejects direct mode names as executable action types;
- trusted controller selection is separate from external text;
- selector output hard-codes `authorityChanged: false` and `executionAuthorized: false`;
- founder HTTP adapter is authenticated;
- browser mutation gate remains required at the server mount;
- exact-head and runtime proof are separate;
- Playwright proof cannot turn a reasoning selection into execution approval.
