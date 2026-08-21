from pathlib import Path
import json


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one seam, found {count}")
    return text.replace(old, new, 1)


# Provider readback must prove exact topology, not merely a requested subset.
path = Path("src/providers/GitHubProvider.ts")
text = path.read_text()

old = '''    ref_name?: {
      include?: string[];
    };
'''
new = '''    ref_name?: {
      include?: string[];
      exclude?: string[];
    };
'''
text = replace_once(text, old, new, "ruleset condition shape")

old = '''  const observedTargets = readback.conditions?.ref_name?.include ?? [];
  for (const target of config.targetRefs) {
    const qualified = `refs/heads/${target}`;
    if (!observedTargets.includes(qualified)) errors.push(`provider read-back is missing requested target: ${qualified}`);
  }

  const expectedBypasses = expectedBypassIdentities(config);
'''
new = '''  const expectedTargets = config.targetRefs.map((ref) => `refs/heads/${ref}`).sort();
  const observedTargets = [...(readback.conditions?.ref_name?.include ?? [])].map(String).sort();
  const observedExcludes = [...(readback.conditions?.ref_name?.exclude ?? [])].map(String).sort();
  if (JSON.stringify(observedTargets) !== JSON.stringify(expectedTargets)) {
    errors.push("review membrane target refs do not exactly match the requested policy");
  }
  if (observedExcludes.length !== 0) {
    errors.push("review membrane must not exclude protected refs");
  }

  const expectedBypasses = expectedBypassIdentities(config);
'''
text = replace_once(text, old, new, "review target exactness")

old = '''  const rules = Array.isArray(readback.rules) ? readback.rules : [];
  const pullRequest = rules.find((rule) => rule.type === "pull_request");
  const pullParameters = pullRequest?.parameters ?? {};
  if (!pullRequest) errors.push("pull request rule is missing");
'''
new = '''  const rules = Array.isArray(readback.rules) ? readback.rules : [];
  const expectedRuleTypes = [
    "pull_request",
    ...(config.blockForcePushes ? ["non_fast_forward"] : []),
    ...(config.blockDeletion ? ["deletion"] : []),
  ].sort();
  const observedRuleTypes = rules.map((rule) => String(rule.type ?? "")).sort();
  if (JSON.stringify(observedRuleTypes) !== JSON.stringify(expectedRuleTypes)) {
    errors.push("review membrane rule types do not exactly match the requested policy");
  }
  const pullRequests = rules.filter((rule) => rule.type === "pull_request");
  if (pullRequests.length !== 1) errors.push("review membrane must contain exactly one pull request rule");
  const pullRequest = pullRequests[0];
  const pullParameters = pullRequest?.parameters ?? {};
'''
text = replace_once(text, old, new, "review rule exactness")

old = '''  const observedTargets = readback.conditions?.ref_name?.include ?? [];
  for (const target of config.targetRefs) {
    const qualified = `refs/heads/${target}`;
    if (!observedTargets.includes(qualified)) {
      errors.push(`freshness provider read-back is missing requested target: ${qualified}`);
    }
  }

  if (observedBypassIdentities(readback).length !== 0) {
'''
new = '''  const expectedTargets = config.targetRefs.map((ref) => `refs/heads/${ref}`).sort();
  const observedTargets = [...(readback.conditions?.ref_name?.include ?? [])].map(String).sort();
  const observedExcludes = [...(readback.conditions?.ref_name?.exclude ?? [])].map(String).sort();
  if (JSON.stringify(observedTargets) !== JSON.stringify(expectedTargets)) {
    errors.push("strict freshness target refs do not exactly match the requested policy");
  }
  if (observedExcludes.length !== 0) {
    errors.push("strict freshness ruleset must not exclude protected refs");
  }

  if (observedBypassIdentities(readback).length !== 0) {
'''
text = replace_once(text, old, new, "freshness target exactness")
path.write_text(text)


# Adversarial provider tests lock exact include/exclude/rule topology.
path = Path("src/providers/__tests__/githubProvider.fcrRulesetHardening.test.ts")
text = path.read_text()
anchor = '''  it("fails closed when review readback widens the trusted app bypass", async () => {
'''
regressions = '''  it("fails before touching the review membrane when freshness readback adds an unrequested target", async () => {
    const widened = freshnessReadback();
    widened.conditions.ref_name.include.push("refs/heads/release");
    mockGetRepoRuleset.mockImplementation(async ({ ruleset_id }: { ruleset_id: number }) => ({
      data: ruleset_id === 2 ? widened : reviewReadback(),
    }));

    const provider = buildProvider();
    await expect(provider.applyBranchRuleset("founder-control-room", config))
      .rejects.toThrow(/strict freshness target refs do not exactly match/);
    expect(mockCreateRepoRuleset).toHaveBeenCalledTimes(1);
  });

  it("fails before touching the review membrane when freshness readback adds an exclusion", async () => {
    const base = freshnessReadback();
    const excluded = {
      ...base,
      conditions: {
        ref_name: {
          ...base.conditions.ref_name,
          exclude: ["refs/heads/main"],
        },
      },
    };
    mockGetRepoRuleset.mockImplementation(async ({ ruleset_id }: { ruleset_id: number }) => ({
      data: ruleset_id === 2 ? excluded : reviewReadback(),
    }));

    const provider = buildProvider();
    await expect(provider.applyBranchRuleset("founder-control-room", config))
      .rejects.toThrow(/strict freshness ruleset must not exclude protected refs/);
    expect(mockCreateRepoRuleset).toHaveBeenCalledTimes(1);
  });

  it("fails closed when review readback adds an unrequested target or exclusion", async () => {
    const base = reviewReadback();
    const widened = {
      ...base,
      conditions: {
        ref_name: {
          include: [...base.conditions.ref_name.include, "refs/heads/release"],
          exclude: ["refs/heads/main"],
        },
      },
    };
    mockGetRepoRuleset.mockImplementation(async ({ ruleset_id }: { ruleset_id: number }) => ({
      data: ruleset_id === 2 ? freshnessReadback() : widened,
    }));

    const provider = buildProvider();
    await expect(provider.applyBranchRuleset("founder-control-room", config))
      .rejects.toThrow(/review membrane target refs do not exactly match/);
  });

  it("fails closed when the bypassable review membrane gains an unexpected rule type", async () => {
    const base = reviewReadback();
    const widened = {
      ...base,
      rules: [...base.rules, { type: "required_signatures" }],
    };
    mockGetRepoRuleset.mockImplementation(async ({ ruleset_id }: { ruleset_id: number }) => ({
      data: ruleset_id === 2 ? freshnessReadback() : widened,
    }));

    const provider = buildProvider();
    await expect(provider.applyBranchRuleset("founder-control-room", config))
      .rejects.toThrow(/review membrane rule types do not exactly match/);
  });

'''
text = replace_once(text, anchor, regressions + anchor, "readback exactness regression anchor")
path.write_text(text)


# Documentation Truth must say exact topology, including empty exclusions and
# no unrequested review rules under the trusted App bypass.
path = Path("docs/PROVIDERS.md")
text = path.read_text()
old = 'A successful provider result receipts **both** ruleset component identities; if the later review mutation fails, the error retains the already-verified freshness ruleset name and ID for reconciliation. Missing, widened, additional, stale, non-strict, or mismatched provider readback fails closed.'
new = 'A successful provider result receipts **both** ruleset component identities; if the later review mutation fails, the error retains the already-verified freshness ruleset name and ID for reconciliation. Readback must exactly match the requested protected-ref include set, must contain no ref exclusions, and the bypassable review membrane must contain exactly its requested rule types; extra targets, exclusions, bypassable rules, widened identities, stale state, non-strict status policy, or any other mismatch fails closed.'
text = replace_once(text, old, new, "provider exact topology documentation")
path.write_text(text)

path = Path("docs/DOCUMENTATION_TRUTH_RECEIPT.json")
receipt = json.loads(path.read_text())
changes = {entry["path"]: entry for entry in receipt["changes"]}
claims = changes["src/providers/GitHubProvider.ts"]["claims"]
claims[0] = (
    "src/providers/GitHubProvider.ts: an active FCR-main governance request must first apply and read back a separate strict required-status ruleset with zero bypass actors, exact requested checks, strict current-base policy, active enforcement, the exact requested include refs, zero ref exclusions, and no unexpected rule types before changing the review membrane; review readback must likewise preserve the exact requested include refs, zero exclusions, and exact bypassable review-rule type set; the composite result must receipt both component identities and partial failure after freshness verification must retain that component identity for reconciliation."
)
path.write_text(json.dumps(receipt, indent=2) + "\n")

print("PR #592 exact ruleset readback repair staged")
