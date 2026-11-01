# Private operator media execution

This is a repository-owned, operator-only LOCAL_PROCESS runtime, not an authenticated hosted service. Keep requests, approvals, job storage and output outside the public checkout. A supplied approval file asserts a separately reviewed decision; it does not authenticate the founder. Do not expose this CLI as an unauthenticated endpoint.

## Implemented boundaries

`DurableMediaJobs` snapshots exact approved reference bytes, binds project, adapter, full input fingerprint, approval record, expiry and budget, and writes private append-only numbered receipts. Project symlinks, altered snapshot descriptors/bytes and out-of-scope approvals fail before submission. Explicit `--execute` is required for submit, poll and materialize. Provider submission ambiguity leaves SUBMITTING and an execution lease for operator reconciliation; never delete that lease and retry without checking the original provider task. Queue validation failures release the queue lease because no provider call occurred.

- `ffmpeg-graphic@v1`: real existing first-party GRAPHIC_ANIMATION renderer, not live-action generation. `request.timeline` uses `FfmpegTimelineSpec`; segment images use `imageReferenceId` to select a snapshot. No arbitrary image paths/custom fonts. Local output is hash-bound and review-required.
- `runway-image-to-video@v1`: opt-in documented Runway `POST /v1/image_to_video` and `GET /v1/tasks/{id}` connection. It is disabled without explicit execution, server-owned `RUNWAY_API_SECRET`, project allowlist, separately approved `gen4.5` eligibility record and positive approved cost reservation. Current contract accepts one PNG/JPEG/WebP reference, `request.model="gen4.5"`, `promptText`, `ratio` (`720:1280` or `1280:720`) and integer `duration` 2–10 seconds. No production-provider canon promotion is implied. See [Runway API](https://docs.dev.runwayml.com/api/) and [API guide](https://docs.dev.runwayml.com/guides/using-the-api/).

The budget is a local authorization ceiling/reservation, not a provider-enforced USD cap or a verified price quote. There are no automatic paid retries. Independently verify current model eligibility, cost and reference approval before a real call.

## Operator flow

Install Node 24 dependencies (`npm ci`) and FFmpeg/ffprobe. Prepare private request JSON with `projectId`, `requestId`, `adapterId`, provider-specific `request` and `references` (`id`, absolute `path`, lowercase SHA-256). Compute its exact fingerprint:

```sh
npm run media:job -- --action fingerprint --input /private/request.json
```

A separately reviewed approval JSON must contain `approved:true`, `sourceRecordId`, matching `projectId`, `adapterId`, `inputFingerprint`, finite `maxCostUsd` (zero for local rendering) and future `expiresAt`. Edits to the request/reference hashes require a new approval. Queue never performs a paid call:

```sh
npm run media:job -- --action queue --root /private/media-jobs --project PROJECT --input /private/request.json --approval /private/approval.json
npm run media:job -- --action submit --root /private/media-jobs --project PROJECT --job JOB_ID --execute
npm run media:job -- --action status --root /private/media-jobs --project PROJECT --job JOB_ID
```

For Runway, add `--adapter runway-image-to-video@v1 --provider-config /private/provider.json` to queue, submit, poll and materialize. The private provider config contains `allowedProjectIds`, `generationEligibility` (`model`, `approved`, `approvalReceiptId`), positive `maxCostUsdLimit` and exact public HTTPS `allowedOutputHosts`. The API key is read only from the server environment. Poll after a pending submission using `--action poll --execute`; polling reads only the saved task ID. Output URLs remain private and are excluded from CLI summaries.

After remote success, explicitly materialize the saved candidate:

```sh
npm run media:job -- --action materialize --root /private/media-jobs --project PROJECT --job JOB_ID --adapter runway-image-to-video@v1 --provider-config /private/provider.json --output /private/media-jobs/PROJECT/JOB_ID/candidate.mp4 --execute
```

Only that exact job-scoped candidate path is accepted. Download uses the saved result, exact HTTPS host allowlist, no auth forwarding, no redirects, timeout/byte limits, MP4 signature/content checks and exclusive private output creation. Completion appends a successor receipt; it never approves the footage.

## Receipt and assembly contract

Version `fcr/media-job@v1` records `jobId`, `projectId`, `adapterId`, `inputFingerprint`, `approvalRecordId`, `recordedAt`, `state`, optional `taskId` and `result`. `result` holds the same `taskId`, `state` and optional `output` (`uri`, `sha256`, `metadata`). Pending adapter results become SUBMITTED. Provider completion becomes SUCCEEDED but may contain a remote URI only; that is not ready for local assembly. Successful materialization retains original job/input/task bindings and replaces the result URI with the exact local candidate path plus actual byte SHA-256. Local FFmpeg success already supplies a local path and hash.

All receipts preserve `outputApproval:"REVIEW_REQUIRED"` and `publishAuthority:false`. An importing project must verify the local bytes and require a separate human shot-review record bound to job, task, project, input fingerprint and output hash. Provider completion, materialization and a candidate filename never confer character canon, visual approval, lip-sync verification or publication permission. Signed remote URLs and private paths must not enter public logs or repositories. A trusted operator can modify local storage; this is not a cryptographically signed remote authority service.

## Validation and evidence limits

`npm run verify:media:handoff` includes the existing routing/storyboard/renderer suites plus durable job, separate-process CLI and mocked Runway transport/materialization tests. The CLI test actually renders with FFmpeg and verifies persisted restart/status behavior. Negative tests cover approval/reference drift, project symlinks, ambiguity-safe submission, safe downloads and review-required receipts. Targeted strict TypeScript and ESLint cover the runtime additions.

A separate synthetic cross-project smoke exercised local FCR rendering, completed receipt, an explicitly TEST-only human-review fixture, downstream importer and a 60-second 162×288 24fps MP4 assembly with metadata checks. This proves the local synthetic connection only. It does not prove approved character footage, live-action generation, paid provider execution, human review or publication. Browser playback remains blocked by unavailable Chromium; metadata checks are not visual playback verification. No deployment or live provider call was made for this change.
