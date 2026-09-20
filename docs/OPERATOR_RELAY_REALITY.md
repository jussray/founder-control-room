# Operator Relay Reality

The founder's intended UX is direct AI-to-AI relay through FCR: an active operator can delegate a bounded task to another named peer operator and receive the validated response without founder copy/paste.

Current implementation truth after the first repair slice:

- the peer relay contract exists;
- dispatch is fail-closed;
- DeepSeek remains instructor-only;
- exact request/response identity is bound;
- mutation authority does not travel with the relay.

This is not yet the live bridge. The relay route still must be mounted into canonical FCR auth/runtime and connected to real provider adapters, then proven in Playwright with exact provider evidence.
