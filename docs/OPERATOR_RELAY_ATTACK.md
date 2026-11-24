# Operator Relay Attack Notes

The relay must fail closed under these attacks:

1. target substitution: request Perplexity, receive Claude;
2. authority smuggling: any write/merge/deploy/publish/provider mutation bit set;
3. stale request: expired packet;
4. context tampering: summary changed after fingerprinting;
5. response replay: response request hash does not match current request;
6. instructor confusion: DeepSeek presented as a peer operator;
7. provider fallback: requested provider unavailable and another provider answers silently;
8. self-relay loops: source and target identical;
9. unsupported capability escalation;
10. provider assertion without an evidence reference.

The current contract/tests cover 1-8. Provider-specific adapters and live proof must cover 9-10 before VERIFIED.
