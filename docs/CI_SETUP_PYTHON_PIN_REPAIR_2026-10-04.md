# CI setup-python immutable-pin repair — 2026-10-04

Status: CURRENT follow-up truth-sync for the October 4, 2026 CI repair cycle.

## Reality

The repository-wide immutable-action hardening introduced a bad `actions/setup-python` commit reference in `.github/workflows/ci.yml`. GitHub Actions could not resolve that action, so the required Python job could not start. That was a workflow-startup failure, not evidence that the Python tests themselves failed.

The bad pin was repaired on `main` by commit `3b38cda20c3337d5ac252d52c93c8ee7d39a6216`, replacing it with the resolvable immutable `actions/setup-python` v6.3.0 commit `ece7cb06caefa5fff74198d8649806c4678c61a1`.

## Authority and proof boundary

Load-bearing GitHub Actions setup steps must use resolvable immutable action SHAs. An invalid immutable pin is not allowed to fall back to a mutable tag and must not be treated as a passing check. The affected required job stays failed/blocked until the pin is repaired and exact-head CI executes again.

The first exact-head CI run after the source repair proved that the corrected Python action could start and that the Python tests passed. The same exact-head run also passed typecheck, lint, the main test job, Playwright e2e, RLS migration contract, Cloudflare bridge authority, and the test-discovery ratchet. Its Required Gate remained red only because the workflow-authority edit itself had not yet received the repository's Documentation Truth follow-up.

That red Required Gate remains historical evidence and is not rewritten as green by this document. This docs-only commit is the bounded truth-sync follow-up permitted by the repository's Documentation Truth canon; its own exact-head CI must execute and pass before this repair cycle can be called closed.

## Related focused repairs in this cycle

- `58709fa848bbd7ef250879dcfcb12adbe34a994c` removed the portfolio evidence sync fallback from the GitHub App token path to `${{ github.token }}`, restoring fail-closed credential authority.
- `c03923a1df0d41bb993db70394683adf750a2106` added the regression contract for that authority boundary.
- `9220106f5de93719ee5a6004d3315746b9ddca43` aligned the n8n activation-probe test with the already-pinned immutable `actions/upload-artifact` action.
- `275be503928ac56121375e2306da23cc2b813101` aligned the n8n runtime-compat test with the same immutable upload-artifact pin.
- `3b38cda20c3337d5ac252d52c93c8ee7d39a6216` repaired the invalid setup-python pin.

These commits repair the merged/current-main state. They do not retroactively convert an earlier failed or unexecuted gate into verified evidence.

## Rollback

If the setup-python repair itself must be reversed, revert the focused repair commit rather than rewriting branch history, then select and independently verify another resolvable immutable `actions/setup-python` commit before re-running exact-head CI. Do not restore the known-bad pin and do not weaken Required Gate or Documentation Truth to obtain green status.
