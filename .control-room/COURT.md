# Founder Court Truth Contract

Status: active standing law for the Founder Court and Founder AI Council.

The Court is the adjudication face of the same logical Court/Council kernel defined by `.control-room/COUNCIL.md` and `.control-room/council-residency.contract.json`. It does not create a second authority plane. It classifies claims, weighs witnesses, preserves dissent, issues holds, and defines the next proof gate.

## Standing law: verification carries a witness class

A claim may not be flattened into the word `VERIFIED` without also preserving how it was verified. Every material verified claim should carry one or more witness classes and evidence references.

Canonical witness classes:

- `repository_source`: authoritative repository/branch/SHA or equivalent source identity.
- `ci_receipt`: automated test, build, workflow, check, or exact-head proof receipt.
- `provider_readback`: provider-owned API/control-plane readback.
- `runtime_identity`: live runtime exposes an identity/version/SHA that can be bound to a deployed candidate.
- `browser_functional`: browser automation proves the user path functions on the target surface.
- `browser_visual`: browser/screenshot comparison proves the rendered surface matches the approved visual canon closely enough for the stated launch goal.
- `independent_challenger`: a separate Council/provider seat independently reproduces or challenges the claim.
- `human_observation`: founder or authorized human directly observes the live result.

Two witnesses that repeat the same upstream receipt remain one evidence chain. Independence must be explicit rather than implied.

When only one evidence chain supports a material claim, the record must say `single-witness` or equivalent. A single-witness claim can still be verified when the evidence is authoritative, but the Court must not misrepresent it as independently reproduced.

## Standing law: functional truth and visual truth are separate

A live product can be functionally green and visually wrong. These states must never collapse into one completion claim.

For any goal that includes a user-facing interface, launch, advertisement destination, storefront, game, app, landing page, control room, or other rendered surface, track at minimum:

- `functional_runtime_state`: whether the intended user path works on the target runtime.
- `visual_canon_state`: whether the rendered target surface matches the approved current visual/product canon.
- `destination_identity_state`: whether the URL being promoted is proven to be the intended runtime/surface.

Allowed visual states are `VERIFIED`, `INFERRED`, `UNKNOWN`, `BLOCKED`, and `FAIL`.

`DEPLOYED` or `RUNTIME VERIFIED` does not imply `VISUAL VERIFIED`.

Source code, component names, CSS presence, design files, screenshots from another host, or an old deployment do not prove the current live visual result. Visual proof requires current browser/render evidence from the exact promoted destination, compared against the current approved canon or reference.

If the live destination is functionally correct but visually stale, wrong, generic, or inconsistent with canon, the Court must record the product as runtime-green / visual-fail and hold user-facing launch completion.

## Standing law: promotion and publication destination gate

Before Council authorizes or recommends a public promotion, advertisement, campaign, or launch CTA to a product URL, the destination must satisfy the goal-relevant evidence gates.

For a user-facing launch this normally means:

1. destination URL identity is known;
2. functional runtime path is verified;
3. visual canon is verified on that exact destination;
4. campaign attribution requirements are satisfied when measurement is part of the launch;
5. any material witness limitation or dissent is preserved in the record.

If a promoted URL is not proven equivalent to the verified runtime, equivalence stays `UNKNOWN`. Do not transfer runtime or visual proof across domains merely because the product name is the same.

If visual canon is `FAIL`, `UNKNOWN`, or `BLOCKED` for a launch whose presentation matters, the publication state is `HOLD` until the visual gate is repaired or the founder explicitly narrows the goal.

## Council inheritance

Every Council seat inherits these laws automatically when evaluating a live product or launch. In particular:

- Muse should challenge witness independence, provider/runtime drift, and cross-surface equivalence.
- ChatGPT/Codex should bind code/build claims to exact source and runtime receipts and must not infer rendered fidelity from source alone.
- Product Design review should compare the live surface against the current canon, not merely inspect design intent.
- Chief may orchestrate and synthesize the evidence but may not erase a failing visual gate or mint proof.
- No majority vote can convert `UNKNOWN`, `BLOCKED`, or `FAIL` evidence into `VERIFIED`.

## Court record

For material launch rulings, preserve:

- claim
- status
- witness class or classes
- evidence reference/fingerprint
- observation time/freshness
- independence relationship
- dissent or limitation
- superseded evidence, if any

The preferred completion vocabulary remains layered:

`SOURCE IMPLEMENTED -> MERGED -> DEPLOYED -> RUNTIME VERIFIED -> VISUAL VERIFIED -> OUTCOME VERIFIED`

Stages may be not applicable for a specific task, but no earlier stage silently satisfies a later one.

## Court response

A Court ruling should make the boundary obvious:

- `REALITY`
- `WITNESSES`
- `VERDICT`
- `HOLD`, if any
- `FIX`
- `PROOF`
- `RISK`
- `ROLLBACK`
- `NEXT GATE`

Court exists to stop false-green completion, especially the dangerous case where the machinery works but the user-facing reality is wrong.
