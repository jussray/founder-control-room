# Live Brain Proof

A provider integration is not considered live merely because provider code, configuration, or secrets exist.

A live brain claim requires runtime evidence that:

1. The deployed runtime identifies its exact release SHA.
2. Provider readiness is reported without exposing credentials.
3. A bounded inference request reaches the selected provider.
4. The result carries provider provenance/evidence identity.
5. A Playwright proof exercises the real user/runtime path.
6. The proof fails closed on missing provider configuration, stale release identity, or missing provenance.

This document is policy only. Merge review must rely on implementation, CI, deployed runtime identity, and Playwright evidence.
