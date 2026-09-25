# FCR ruleset mutation request

This file is the durable source receipt for the provider-side mutation that cannot be executed through the current connector.

- ruleset id: `20819094`
- current problem: production-grade rules apply to `~ALL`
- exact change: remove `~ALL` from `conditions.ref_name.include`
- retain: `~DEFAULT_BRANCH`
- preserve: required checks, Code Scanning, code quality, linear history, deletion protection, required deployments on the release/default branch
- do not weaken: main/release protections
- proof after mutation: live ruleset audit PASS + main-push PR Continuity rollover PASS + fresh successor exact-head CI

No provider mutation has been claimed.
