# Portfolio release candidate and isolated hotfixes

The files in `releases/` are candidate release records, **not approval to deploy**.

## Reconcile a revision
Verify the local clone's origin URL against `release-policy/repositories.json` before fetching. Use full relevant history and run:

```sh
python scripts/find_release_commit.py --repo ../StoryEngine --commit cd0b9be --requires 7dbfecd --requires 645d929 --requires 85e325d --requires 87f519d
```

Exit 0 means approved-history ancestry passed; exit 1 means a valid ancestry failure; exit 2 means audit error. Neither success nor ancestry proves behavior or compatibility.

## Single-repository hotfix

1. Copy the **previous approved manifest** to a new release file. Never edit an existing published manifest.
2. Increment the portfolio release version and update exactly one repository commit pin. Keep the other two pin objects unchanged.
3. Verify pin isolation with:

```sh
python scripts/validate_portfolio_hotfix.py --previous releases/portfolio-v0.1.0.json --candidate releases/portfolio-v0.1.1.json --changed storyengine
```

4. Validate the new manifest against the trusted schema and repository allowlist.
5. Run the required repository, peer-contract, integration, and security regression suites on the exact tuple.
6. Bind evidence to manifest SHA-256, validator revision, test inventory, and run identity.
7. Obtain explicit approval before publishing, merging, or deploying.

**Fail closed:** No automatic publication is wired. Required compatibility suites are not configured, so the preflight workflow deliberately fails. Do not remove the gate just to turn CI green. PR candidate commits not on approved main require a separately approved maintenance-branch policy. Database and external state rollbacks require independent review.
