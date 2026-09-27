# Rollover provider truth

The active-work rollover algorithm and provider policy are separate proof subjects.

- Algorithm attack tests: PASS in main-push run `36078682762` before mutation.
- Provider mutation: FAIL in the same run.
- Provider response: HTTP 422 repository rule violations.
- Ruleset topology: active ruleset `20819094` includes `~ALL` and release-grade status/code-scanning/linear-history/deployment requirements.

Therefore:

`ACTIVE_WORK_ROLLOVER = SOURCE_VERIFIED / PROVIDER_BLOCKED`

Do not relabel this as an ancestry bug, merge-conflict-only bug, or deployment-candidate lease bug.
