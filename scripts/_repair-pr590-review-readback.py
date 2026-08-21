from pathlib import Path
import json


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one seam, found {count}")
    return text.replace(old, new, 1)


# Capture the review ruleset identity immediately after provider mutation so a
# later readback failure can reconcile every object already changed.
path = Path("src/providers/GitHubProvider.ts")
text = path.read_text()
old = '''    const { data: existing } = await this.octokit.repos.getRepoRulesets({ owner, repo, per_page: 100 });
    let freshnessComponent: NonNullable<RulesetResult["components"]>[number] | undefined;
'''
new = '''    const { data: existing } = await this.octokit.repos.getRepoRulesets({ owner, repo, per_page: 100 });
    let freshnessComponent: NonNullable<RulesetResult["components"]>[number] | undefined;
    let reviewComponent: NonNullable<RulesetResult["components"]>[number] | undefined;
'''
text = replace_once(text, old, new, "review component declaration")

old = '''      const { data } = match
        ? await this.octokit.repos.updateRepoRuleset({ ...payload, ruleset_id: match.id })
        : await this.octokit.repos.createRepoRuleset(payload);

      if (hardenFounderControlRoomMainReview) {
'''
new = '''      const { data } = match
        ? await this.octokit.repos.updateRepoRuleset({ ...payload, ruleset_id: match.id })
        : await this.octokit.repos.createRepoRuleset(payload);
      reviewComponent = {
        purpose: "review",
        id: String(data.id),
        name: data.name,
        enforcement: data.enforcement,
      };

      if (hardenFounderControlRoomMainReview) {
'''
text = replace_once(text, old, new, "capture review mutation identity")

old = '''      throw new Error(
        `GitHubProvider: FCR review membrane failed after verified strict-freshness ruleset ${freshnessComponent.name} (${freshnessComponent.id}): ${message}`,
      );
'''
new = '''      const reviewReceipt = reviewComponent
        ? ` and mutated review ruleset ${reviewComponent.name} (${reviewComponent.id})`
        : "";
      throw new Error(
        `GitHubProvider: FCR review membrane failed after verified strict-freshness ruleset ${freshnessComponent.name} (${freshnessComponent.id})${reviewReceipt}: ${message}`,
      );
'''
text = replace_once(text, old, new, "partial mutation error receipt")
path.write_text(text)


# Strengthen the existing review-readback regression to require both provider
# identities and prove no fallback/duplicate mutation occurs.
path = Path("src/providers/__tests__/githubProvider.fcrRulesetHardening.test.ts")
text = path.read_text()
old = '''    const provider = buildProvider();
    await expect(provider.applyBranchRuleset("founder-control-room", config))
      .rejects.toThrow("bypass actors do not match the requested policy");
  });

  it("surfaces the verified freshness identity when the review mutation fails", async () => {
'''
new = '''    const provider = buildProvider();
    await expect(provider.applyBranchRuleset("founder-control-room", config))
      .rejects.toThrow(/strict-freshness ruleset .* \\(2\\).*mutated review ruleset .* \\(1\\).*bypass actors do not match the requested policy/);

    expect(mockCreateRepoRuleset.mock.calls.map((call) => call[0].name))
      .toEqual([freshnessName(), config.name]);
    expect(mockGetRepoRuleset.mock.calls.map((call) => call[0].ruleset_id))
      .toEqual([2, 1]);
  });

  it("surfaces the verified freshness identity when the review mutation fails", async () => {
'''
text = replace_once(text, old, new, "review readback partial mutation regression")
path.write_text(text)


# Documentation truth: distinguish review write failure from review readback
# failure after both provider objects have already changed.
path = Path("docs/PROVIDERS.md")
text = path.read_text()
old = '''A successful provider result receipts **both** ruleset component identities; if the later review mutation fails, the error retains the already-verified freshness ruleset name and ID for reconciliation. Missing, widened, additional, stale, non-strict, or mismatched provider readback fails closed.'''
new = '''A successful provider result receipts **both** ruleset component identities. If the later review write fails, the error retains the already-verified freshness ruleset name and ID; if the review write succeeds but its hardened readback fails, the error retains **both** mutated provider identities so reconciliation never has to guess which objects changed. Missing, widened, additional, stale, non-strict, or mismatched provider readback fails closed.'''
text = replace_once(text, old, new, "provider partial mutation documentation")
path.write_text(text)


path = Path("docs/DOCUMENTATION_TRUTH_RECEIPT.json")
receipt = json.loads(path.read_text())
changes = {entry["path"]: entry for entry in receipt["changes"]}
claim = changes["src/providers/GitHubProvider.ts"]["claims"][0]
old_claim = "the composite result must receipt both component identities and partial failure after freshness verification must retain that component identity for reconciliation."
new_claim = "the composite result must receipt both component identities, review-write failure must retain the verified freshness identity, and review-readback failure after both writes must retain both mutated provider identities for reconciliation."
if old_claim not in claim:
    raise RuntimeError("documentation receipt claim seam missing")
changes["src/providers/GitHubProvider.ts"]["claims"][0] = claim.replace(old_claim, new_claim)
path.write_text(json.dumps(receipt, indent=2) + "\n")

print("PR #590 review-readback reconciliation repair staged")
