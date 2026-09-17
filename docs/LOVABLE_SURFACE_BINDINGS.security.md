# Public manifest security boundary

The external-surface manifest is intentionally public and cross-origin readable. It may contain only non-secret surface identity, canonical repository identity, branch identity, role, non-authority flags, surface continuity commit, and public-safe rules.

It must not contain API keys, tokens, authorization headers, credentials, private founder state, customer/user content, raw evidence, private analytics, provider payloads, environment values, billing details, or security-sensitive implementation material.

The dedicated tests scan the manifest/schema for common secret-bearing markers. This is a narrow safeguard, not a replacement for GitHub secret scanning or artifact review.
