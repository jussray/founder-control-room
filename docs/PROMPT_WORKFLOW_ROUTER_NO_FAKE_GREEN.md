# No Fake Green

Do not make the mount gate green by deleting the assertion, skipping the test, mocking `src/http/server.ts`, or changing the proof vocabulary.

The valid repair is the actual focused server import + mount, followed by execution of the proof chain.

Likewise, do not skip the deployed Playwright spec and call the feature live. A skipped test is `NOT RUN`, not `PASS`.
