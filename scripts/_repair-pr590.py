from pathlib import Path
import json


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one seam, found {count}")
    return text.replace(old, new, 1)


# 1. Provider-neutral result must receipt every provider object mutated by a
# composite ruleset operation.
path = Path("src/providers/RepositoryProvider.ts")
text = path.read_text()
old = '''export interface RulesetResult {
  /** Provider-specific ruleset identifier, for later reference or rollback. */
  id: string;
  name: string;
  enforcement: string;
}
'''
new = '''export interface RulesetResult {
  /** Provider-specific primary ruleset identifier. */
  id: string;
  name: string;
  enforcement: string;
  /**
   * Composite provider mutations expose every durable component identity so
   * caller ledgers can reconcile partial success without guessing provider state.
   */
  components?: Array<{
    purpose: string;
    id: string;
    name: string;
    enforcement: string;
  }>;
}
'''
path.write_text(replace_once(text, old, new, "RulesetResult"))


# 2. Keep active FCR migration fail-safe: strict no-bypass freshness first,
# then review. Receipt both identities. If the second mutation fails, preserve
# the already-verified freshness identity in the error for reconciliation.
path = Path("src/providers/GitHubProvider.ts")
text = path.read_text()
start_marker = "    const { data: existing } = await this.octokit.repos.getRepoRulesets({ owner, repo, per_page: 100 });"
end_marker = "    return { id: String(data.id), name: data.name, enforcement: data.enforcement };"
start = text.find(start_marker)
if start < 0:
    raise RuntimeError("GitHubProvider start seam missing")
end_start = text.find(end_marker, start)
if end_start < 0:
    raise RuntimeError("GitHubProvider end seam missing")
end = end_start + len(end_marker)
replacement = '''    const { data: existing } = await this.octokit.repos.getRepoRulesets({ owner, repo, per_page: 100 });
    let freshnessComponent: NonNullable<RulesetResult["components"]>[number] | undefined;

    if (hardenFounderControlRoomMainReview) {
      // Apply and verify the no-bypass freshness membrane FIRST. If any provider
      // call or readback fails, the review membrane is left untouched rather
      // than creating a transient weakening while migrating the topology.
      const freshnessName = fcrMainFreshnessRulesetName(config.name);
      const freshnessRules: RepoRule[] = [{
        type: "required_status_checks",
        parameters: {
          do_not_enforce_on_create: false,
          required_status_checks: config.requiredStatusCheckNames.map((context) => ({ context })),
          strict_required_status_checks_policy: true,
        },
      }];
      const freshnessPayload = {
        owner,
        repo,
        name: freshnessName,
        target: "branch" as const,
        enforcement: config.enforcement,
        bypass_actors: [],
        conditions: {
          ref_name: {
            include: config.targetRefs.map((ref) => `refs/heads/${ref}`),
            exclude: [],
          },
        },
        rules: freshnessRules,
      };
      const freshnessMatch = existing.find((ruleset) => ruleset.name === freshnessName);
      const { data: freshnessData } = freshnessMatch
        ? await this.octokit.repos.updateRepoRuleset({ ...freshnessPayload, ruleset_id: freshnessMatch.id })
        : await this.octokit.repos.createRepoRuleset(freshnessPayload);
      const { data: freshnessReadback } = await this.octokit.repos.getRepoRuleset({
        owner,
        repo,
        ruleset_id: freshnessData.id,
      });
      const freshnessErrors = fcrMainFreshnessRulesetReadbackErrors(
        config,
        freshnessName,
        freshnessReadback,
      );
      if (freshnessErrors.length > 0) {
        throw new Error(
          `GitHubProvider: FCR strict-freshness ruleset ${freshnessData.id} read-back mismatch: ${freshnessErrors.join("; ")}`,
        );
      }
      freshnessComponent = {
        purpose: "strict_freshness",
        id: String(freshnessData.id),
        name: freshnessData.name,
        enforcement: freshnessData.enforcement,
      };
    }

    const applyReviewMembrane = async () => {
      const match = existing.find((ruleset) => ruleset.name === config.name);
      const { data } = match
        ? await this.octokit.repos.updateRepoRuleset({ ...payload, ruleset_id: match.id })
        : await this.octokit.repos.createRepoRuleset(payload);

      if (hardenFounderControlRoomMainReview) {
        const { data: readback } = await this.octokit.repos.getRepoRuleset({
          owner,
          repo,
          ruleset_id: data.id,
        });
        const errors = fcrMainReviewRulesetReadbackErrors(config, readback);
        if (errors.length > 0) {
          throw new Error(`GitHubProvider: FCR review ruleset ${data.id} read-back mismatch: ${errors.join("; ")}`);
        }
      }
      return data;
    };

    const data = await applyReviewMembrane().catch((error: unknown) => {
      if (!freshnessComponent) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `GitHubProvider: FCR review membrane failed after verified strict-freshness ruleset ${freshnessComponent.name} (${freshnessComponent.id}): ${message}`,
      );
    });

    return {
      id: String(data.id),
      name: data.name,
      enforcement: data.enforcement,
      ...(freshnessComponent
        ? {
            components: [
              {
                purpose: "review",
                id: String(data.id),
                name: data.name,
                enforcement: data.enforcement,
              },
              freshnessComponent,
            ],
          }
        : {}),
    };'''
path.write_text(text[:start] + replacement + text[end:])


# 3. Provider regressions: successful composite result receipts both objects;
# partial failure surfaces the verified first component.
path = Path("src/providers/__tests__/githubProvider.fcrRulesetHardening.test.ts")
text = path.read_text()
old = '''    const provider = buildProvider();
    await provider.applyBranchRuleset("founder-control-room", config);

    expect(mockCreateRepoRuleset).toHaveBeenCalledTimes(2);
'''
new = '''    const provider = buildProvider();
    const result = await provider.applyBranchRuleset("founder-control-room", config);

    expect(result.components).toEqual([
      { purpose: "review", id: "1", name: config.name, enforcement: "active" },
      { purpose: "strict_freshness", id: "2", name: freshnessName(), enforcement: "active" },
    ]);
    expect(mockCreateRepoRuleset).toHaveBeenCalledTimes(2);
'''
text = replace_once(text, old, new, "ruleset success receipt")
old = '''      .rejects.toThrow("FCR strict-freshness ruleset read-back mismatch");
'''
new = '''      .rejects.toThrow(/FCR strict-freshness ruleset .* read-back mismatch/);
'''
text = replace_once(text, old, new, "freshness mismatch assertion")
anchor = '''  it("updates both stable ruleset identities when they already exist", async () => {
'''
regression = '''  it("surfaces the verified freshness identity when the review mutation fails", async () => {
    mockCreateRepoRuleset.mockImplementation(async (payload: { name: string; enforcement: string }) => {
      if (payload.name === freshnessName()) {
        return { data: { id: 2, name: payload.name, enforcement: payload.enforcement } };
      }
      throw new Error("review write failed");
    });

    const provider = buildProvider();
    await expect(provider.applyBranchRuleset("founder-control-room", config))
      .rejects.toThrow(/strict-freshness ruleset .* \(2\).*review write failed/);

    expect(mockCreateRepoRuleset.mock.calls.map((call) => call[0].name))
      .toEqual([freshnessName(), config.name]);
  });

'''
text = replace_once(text, anchor, regression + anchor, "partial mutation regression")
path.write_text(text)


# 4. Route-level durable receipt regression.
path = Path("src/http/routes/__tests__/projects.ruleset.integration.test.ts")
text = path.read_text()
old = '''  applyResult?: { id: string; name: string; enforcement: string };
'''
new = '''  applyResult?: {
    id: string;
    name: string;
    enforcement: string;
    components?: Array<{ purpose: string; id: string; name: string; enforcement: string }>;
  };
'''
text = replace_once(text, old, new, "route result type")
anchor = '''  it("records a failed execution and returns 502 when the provider call throws", async () => {
'''
regression = '''  it("persists composite provider component receipts in the execution result", async () => {
    const components = [
      { purpose: "review", id: "1", name: "protect-main", enforcement: "active" },
      { purpose: "strict_freshness", id: "2", name: "protect-main [strict freshness]", enforcement: "active" },
    ];
    const { updateMock } = stubRoute({
      applyResult: { id: "1", name: "protect-main", enforcement: "active", components },
    });
    const res = await request(buildApp())
      .post(`/projects/${PROJECT_SLUG}/ruleset`)
      .set("Authorization", BEARER)
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.result.components).toEqual(components);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "succeeded",
        result: expect.objectContaining({ components }),
        success: true,
      }),
    );
  });

'''
text = replace_once(text, anchor, regression + anchor, "route component receipt regression")
path.write_text(text)


# 5. Documentation truth: rollback is restoration to an active safe topology,
# never disabling the constitutional FCR membrane.
path = Path("docs/PROVIDERS.md")
text = path.read_text()
old = 'For active governance protecting `jussray/founder-control-room` `main`, repository identity is constitutional and mutable project slugs are not. One founder policy request is translated into **two aggregated GitHub rulesets**. The review membrane owns pull-request requirement, approving-review freshness, last-push approval, review-thread resolution, force-push protection, and deletion protection; it contains exactly one App actor whose numeric ID equals trusted `GITHUB_APP_ID`, and that bypass is constrained to GitHub `pull_request` mode. The strict-freshness companion owns the exact required status checks with `strict_required_status_checks_policy: true`, targets the same protected refs, contains zero bypass actors, and contains no pull-request or other rule types. The provider applies and reads back the no-bypass freshness membrane before changing the review membrane, so a partial reconciliation cannot remove the old status membrane before its stricter replacement is proven. Missing, widened, additional, stale, non-strict, or mismatched provider readback fails closed.'
new = 'For active governance protecting `jussray/founder-control-room` `main`, repository identity is constitutional and mutable project slugs are not. One founder policy request is translated into **two aggregated GitHub rulesets**. The review membrane owns pull-request requirement, approving-review freshness, last-push approval, review-thread resolution, force-push protection, and deletion protection; it contains exactly one App actor whose numeric ID equals trusted `GITHUB_APP_ID`, and that bypass is constrained to GitHub `pull_request` mode. The strict-freshness companion owns the exact required status checks with `strict_required_status_checks_policy: true`, targets the same protected refs, contains zero bypass actors, and contains no pull-request or other rule types. The provider applies and reads back the no-bypass freshness membrane before changing the review membrane, so a partial active reconciliation cannot weaken the old membrane. A successful provider result receipts **both** ruleset component identities; if the later review mutation fails, the error retains the already-verified freshness ruleset name and ID for reconciliation. Missing, widened, additional, stale, non-strict, or mismatched provider readback fails closed.'
text = replace_once(text, old, new, "provider guide split topology")
marker = '\n\nCanonical founder-final integration must use'
rollback = '\n\nThe canonical FCR ruleset cannot be disabled, demoted to evaluate mode, or retargeted away from `main` through the generic repository-administration route. A live provider rollback therefore means a separately authorized restoration to a previously proven **active** safe topology, with readback of both component identities; it does not mean turning governance off.'
text = replace_once(text, marker, rollback + marker, "provider rollback truth")
path.write_text(text)


# 6. Structured Documentation Truth receipt mirrors the same invariant.
path = Path("docs/DOCUMENTATION_TRUTH_RECEIPT.json")
receipt = json.loads(path.read_text())
changes = {entry["path"]: entry for entry in receipt["changes"]}
provider_claims = changes["src/providers/GitHubProvider.ts"]["claims"]
provider_claims[0] = (
    "src/providers/GitHubProvider.ts: an active FCR-main governance request must first apply and read back a separate strict required-status ruleset with zero bypass actors, exact requested checks, strict current-base policy, active enforcement, and no unexpected rule types before changing the review membrane; the composite result must receipt both component identities and partial failure after freshness verification must retain that component identity for reconciliation."
)
repo_claims = changes["src/providers/RepositoryProvider.ts"]["claims"]
extra_claim = (
    "src/providers/RepositoryProvider.ts: composite ruleset mutations may return provider-neutral component receipts so durable caller ledgers can identify every mutated provider object without guessing state."
)
if extra_claim not in repo_claims:
    repo_claims.append(extra_claim)
path.write_text(json.dumps(receipt, indent=2) + "\n")

print("PR #590 composite ruleset receipt repair staged")
