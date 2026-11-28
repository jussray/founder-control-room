# Canonical library intake — candidate

A read-only package admission utility under the existing [continuity-proof-ledger skill](../../skills/continuity-proof-ledger/SKILL.md). It does not create a second memory store, replace an existing ledger, import private files, or grant publication authority.

The original historical archive and its Python sources have not been received. This is a new, independently authored intake utility, not a recovery or a substitute for the original library implementation.

## Run

From this directory, with Python 3.11+:

```sh
python -m unittest -v test_ledger
python ledger.py /path/to/extracted-package /path/to/normalized-manifest.json --checkpoint /path/to/trusted-checkpoint.json
```

Normalize the actual package manifest only after inspecting its schema. The external normalized manifest has schema `juss/canonical-library-intake@1` and a `files` list containing relative `path` and lowercase SHA-256 `sha256` fields. It must cover every regular file in the extracted package, including `ledger/ledger.jsonl`. Keep this normalized manifest outside that directory. Do not extract untrusted ZIPs with this tool; it assumes a safely extracted, quiescent local directory.

An optional separate checkpoint contains positive integer `prefix_bytes` and lowercase `prefix_sha256` for a complete historical ledger prefix, including its terminating newline. Its trust must be established independently; the tool does not authenticate checkpoint signatures. The utility detects changed, unlisted, missing or unsafe paths and a mismatch with the supplied prefix. An archive without an independent checkpoint remains unanchored, even if all its self-reported hashes match.

The original ledger's entry-chain algorithm, occurrence preservation, source hashes, signatures and full migration invariants must still be verified using its actual implementation before integration. No archives, raw private records, credentials, full proprietary skill bodies or checkpoint signatures are included here. No FCR runtime, CI or publication configuration changes.

## Next gate

Receive the original bundle and compare the real schema. Keep raw records in authorized private custody, preserve every occurrence and revision, route skills to their existing owners, and record only safe evidence metadata through the existing FCR continuity contract. Require exact-candidate review and separate authorization before integration. Rollback is to leave this candidate unmerged; no historical records are affected.
