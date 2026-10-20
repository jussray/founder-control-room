# Operator Relay Next Gate

The canonical relay is already mounted through the authenticated FCR `/mcp` authority path. Do not mount the standalone `/api/operator-relay` test router and do not create a second authority surface.

The next gate is live proof, not another contract file:

1. deploy the exact candidate head;
2. confirm the deployed FCR runtime identifies that exact head;
3. use an OAuth-bound operator client mapped by `FCR_REMOTE_MCP_OPERATOR_CLIENT_MAP`;
4. issue one bounded relay request to the exact requested peer provider;
5. require a response bound to the exact relay/request hash and provider evidence reference;
6. prove the founder-visible round trip with Playwright against the real runtime;
7. keep mutation, merge, deploy, publish, and provider-mutation authority false throughout.

If the requested provider key/model is absent or provider authentication fails, return the precise provider/relay blocker. Never silently substitute a different provider and never promote fingerprints or proof cookies into authority.
