---
name: makevideo
description: Render a bounded first-party FCR graphic video through the repository's own FFmpeg adapter. Use for /MAKEVIDEO, /makevideo, /video, or ordinary requests such as "make this video" when the requested output belongs to Founder Control Room.
---

# FCR MAKEVIDEO adapter

Use Founder Control Room's own local-process renderer. Do not route the render through Chief, Bip, StoryEngine, or an external provider unless a separate current capability/authority decision explicitly selects one.

## Authority

A render request authorizes bounded byte production only. It does not grant truth, release, publishing, billing, or deployment authority. Preserve the renderer receipt, input fingerprint, source hashes, output SHA-256, and ffmpeg/ffprobe readback.

## Execute

1. Convert the approved creative intent into the current `FfmpegTimelineSpec` accepted by `src/lib/mediaFfmpegRender.ts`. Do not invent fields the current type does not support.
2. Save the bounded timeline JSON locally.
3. Run:

```bash
npx tsx scripts/render-video.mts --input <timeline.json> --output <output.mp4>
```

4. Require `kind: "RENDERED"`. Treat `CAPABILITY_UNAVAILABLE`, `REJECTED`, and `FAILED` as non-green states.
5. Run the focused renderer proof:

```bash
npx vitest run src/lib/__tests__/mediaFfmpegRender.test.ts
```

6. Run Playwright playback against the real rendered bytes:

```bash
node scripts/verify-video-playback.mjs --media <output.mp4>
```

7. Keep rendering, product truth, release approval, and publication as separate gates.

## Stop conditions

Stop instead of improvising when source authority is unknown, ffmpeg/ffprobe is unavailable, the timeline is rejected, the output cannot be probed or played, or the requested claim would require publication/product-truth authority the renderer does not possess.
