# Goalfix rationale

The actual gap is identity/provenance wiring between existing external builder surfaces and existing canonical repositories. The smallest safe fix is a non-authoritative binding contract plus tests. It does not create a new project registry, truth engine, database, orchestrator, provider adapter, or execution path.

The existing authority-bearing `PORTFOLIO_PROJECTS` list remains unchanged. External surfaces point to canonical projects; they do not become canonical projects themselves.
