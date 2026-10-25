# PromptOS Integration Boundary

PromptOS remains the versioned prompt-template library. The Builder Prompt Workflow Router is the deterministic control vocabulary for selecting reasoning/evidence stacks.

PromptOS templates may reference these workflow contracts for reusable content, but template CRUD must not become an execution-authority path. A stored prompt body is data until a trusted controller selects a workflow under existing authority.

This separation lets PromptOS evolve its prompt catalog without turning template edits into governance changes.
