# Exact-candidate proof requirements

This change is not merge-ready merely because the manifest exists.

Required repository proof on one exact candidate SHA:

1. lint
2. typecheck
3. focused external-surface tests
4. full FCR test suite
5. test-discovery ratchet
6. Required Gate
7. CodeQL/security checks
8. Cloudflare Pages build/deployment receipt for the public `.well-known` manifest

External Lovable runtime proof is separate and cannot be inferred from these repository checks.
