# Media Visual Grammar v1

## Purpose

Founder Control Room uses one shared visual grammar for image and video routing so a visual structure is selected because it helps the viewer understand the job, not because it is fashionable decoration.

The contract is intentionally non-authorizing. Media Router still routes and stores. Domain protocols still classify truth, rights, release, and publication authority.

## Canonical modes

The closed v1 set is:

1. `handwritten`
2. `decision_matrix`
3. `infographic`
4. `canvas`
5. `layers`
6. `cycle`
7. `diagram`
8. `roadmap`
9. `sketchnotes`
10. `iceberg`
11. `blueprint`
12. `exploded_view`
13. `tree`
14. `timeline`

These names align with the StoryEngine `/MAKEVIDEO` visual grammar so a project-local production protocol and FCR can exchange the communication structure without moving release authority into the router.

## Selection rule

Start with the viewer job. Choose the smallest structure that makes the idea easier to understand.

A selection may contain:

- one primary mode;
- optionally one distinct supporting mode;
- an explicit rationale for the primary job;
- an explicit separate rationale for the supporting mode;
- the still-image composition or video reveal behavior that belongs to the selected mode.

No primary mode is valid when ordinary composition communicates the job more clearly. A supporting mode cannot duplicate the primary mode and cannot exist without a separate reason.

## Image behavior

For an image, the selected mode contributes a composition rule. Examples:

- `decision_matrix` becomes a compact option-by-criterion comparison;
- `iceberg` separates visible effects from hidden causes;
- `exploded_view` separates parts while preserving assembly relationships;
- `timeline` uses one chronological axis.

The grammar does not choose brand canon, identity, evidence, rights, or factual claims.

## Video behavior

For video, the same mode becomes a reveal rule over time. Examples:

- `timeline` advances chronologically;
- `iceberg` establishes the visible surface before descending to hidden causes;
- `exploded_view` disassembles, explains component jobs, then reassembles;
- `cycle` travels the loop in order before showing recurrence;
- `roadmap` advances through milestones and gates.

Motion must serve the explanatory job rather than turning a still layout into arbitrary animation.

## Fingerprints and continuity

`createVisualGrammarSelectionV1()` fingerprints the selected structure, viewer job, rationale, source protocol/reference, and image/video behavior.

`bindVisualGrammarToMediaRoutingRequest()` returns an enumerable request extension. FCR already fingerprints the complete runtime request when it produces a route recommendation, so a changed visual mode or rationale creates a changed route identity without modifying Media Router's authority ceiling.

A continuity fingerprint is evidence of which structure was selected. It is not a bearer token and grants no provider, billing, release, rights, factual, merge, deploy, publication, or founder authority.

## Truth boundary

Visual structure never upgrades evidence.

- generated UI remains `SIMULATED` or `ILLUSTRATIVE` unless separate evidence proves real product behavior;
- a diagram is not proof merely because it looks technical;
- an infographic is not verified merely because it contains numbers;
- a blueprint is not implementation proof;
- a timeline does not prove that an event occurred;
- a decision matrix does not authorize the decision it presents.

Real product proof continues to prefer real browser/device capture and exact-scope evidence.

## Outcome learning

Successful, outcome-proven visual structures may be promoted into the reusable visual library for the same lane and viewer job. Failed or unproven structures remain revision evidence rather than being deleted or silently promoted.

Promotion never widens truth or action authority. It only records that a communication structure worked for a bounded intent.
