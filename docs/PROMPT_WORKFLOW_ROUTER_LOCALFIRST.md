# Local First — Prompt Workflow Router

The intent → workflow map is a pure local TypeScript structure. Selecting a workflow does not require a cloud model, provider API, database read, or network round trip at the core logic layer.

The HTTP adapter adds founder authentication for shared FCR access. Execution, secrets, publication, billing, and other server-authoritative concerns remain outside the selector.

This preserves useful local/offline composition while keeping consequential authority in the existing server/control plane.
