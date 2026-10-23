# FCR Browser Operator v1 — synthetic browser journeys

**Owner:** Founder Control Room. **Engine:** Playwright. **Paid browser agents:** none. This does not imply zero GitHub runner or infrastructure costs.

## Implementation in this candidate

- scripts/fcr-browser-journey.mjs is the reusable deterministic browser-runner.
- config/browser-journeys/sync-party.json is a reviewable two-actor (desktop host and mobile guest) live test manifest. It tests CREATE → JOIN → CHOOSE → SYNC → SCORE → REPLAY.
- test/fcr-browser-journey.test.mjs checks static policy and manifest validity.
- .github/workflows/fcr-browser-operator.yml runs contract tests for review and allows a separate manual live journey.
- HTTPS and approved portfolio hostnames only; same-origin request restrictions; synthetic test identities; no arbitrary JavaScript actions.
- Browser-run step receipt and failure-only screenshot stay in the configured artifact directory. They are not committed to source.

## Usage

Validate without live site traffic:

    node --test test/fcr-browser-journey.test.mjs
    node scripts/fcr-browser-journey.mjs config/browser-journeys/sync-party.json --dry-run

Run the synthetic live journey using locally installed Playwright Chromium:

    npx playwright install chromium
    node scripts/fcr-browser-journey.mjs config/browser-journeys/sync-party.json --run

After merging the workflow into the default branch under exact-head approval, a founder can manually dispatch FCR Browser Operator with journey=sync-party and execute=true. Live runs can create temporary rooms and synthetic analytics events. **They are not read-only.**

Report path: test-results/fcr-browser-operator/report.json by default, or FCR_BROWSER_OUT_DIR/report.json. Failure-only screenshots may show page content; review before sharing. The JSON report intentionally excludes captured room codes, user input values, cookies, query parameters, and page text.

## Boundaries

- Only source-reviewed manifests directly in config/browser-journeys can be executed by the CLI. No free-form instructions from the visited page are trusted.
- No founder session, credentials, stored cookies, private application data, or production account should be used in a journey.
- Navigation and HTTP requests are restricted to the declared origin where intercepted. This is NOT a full sandbox or a guarantee against other protocols, such as WebSockets.
- No teen, parent, journal, voice, family or other private data may be included in browser-test artifacts.
- The operator cannot merge, deploy, alter secrets, change authentication, delete records, or write source code as a result of website content.
- A PASS proves only this explicitly reviewed public synthetic journey at that moment; it is not overall launch readiness.
- Failures produce reproducible step labels and screenshots when possible, not automatic provider or production mutations.

## Next gate: truly agentic FCR

This v1 runner deliberately does not accept arbitrary natural-language action plans, edit application code or expose a new FCR website button. Future work should add a founder-authenticated, reviewable planner/UI that turns a request into a scoped manifest, validates the plan before execution, and separately authorizes any browser writes and proposed repairs. Preserve current FCR founder approval gates, project isolation, provider-neutral architecture, and exact-head evidence.

The selectors are based on Sync Party source and test files, not yet on a successful live website execution. Verify the live runtime separately before labeling this capability operational.
