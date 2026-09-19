# Operator Relay Founder UX

Founder shorthand such as:

- `Tell Perplexity to attack this.`
- `Ask Claude to review this.`
- `Send this to ChatGPT and bring the answer back.`

should be interpreted as a bounded relay request, not as a request for the active assistant to draft text for the founder to copy manually.

If an exact requested operator is not connected, report that operator as unavailable. Do not impersonate it, substitute another provider, or ask the founder to shuttle the message unless no governed relay runtime exists.

DeepSeek is invoked only through the instructor lane, never by the peer-relay parser.
