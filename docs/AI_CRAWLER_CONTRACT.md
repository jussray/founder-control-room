# AI Crawler Contract v1

This project treats automated access as a product surface, not as an automatic license to copy everything.

## Founder intent

Public crawlers should create value for the project: discovery, citations, qualified referral traffic, user-directed retrieval, and, when provider support exists, paid crawler access. Model-training and bulk dataset collection are denied by default unless the founder explicitly changes that policy.

## Policy

1. **Search/discovery:** allow reputable search and answer engines to crawl intentionally public, canonical pages.
2. **User-directed retrieval:** allow reputable assistants to fetch intentionally public pages when a user asks for them.
3. **Training/dataset collection:** deny by default.
4. **Private surfaces:** authentication, admin, internal APIs, private user data, logs, secrets, drafts, and governance-only material never become public because a crawler file mentions them.
5. **Attribution:** machine-readable discovery surfaces should point crawlers to canonical URLs and request source attribution/linking when the crawler supports it.
6. **Authority:** crawler access is read-only. A crawler, model, citation, generated summary, or public metadata never grants execution, publication, merge, deployment, billing, credential, or founder authority.
7. **Evidence:** public claims should resolve to current canonical source/runtime evidence. Unknown stays unknown.
8. **Monetization:** where Cloudflare AI Crawl Control / Pay Per Crawl is available and explicitly enabled, keep discovery metadata free, allow high-value referral/search crawlers, and consider charging bulk AI crawler access instead of granting it for free. Do not claim paid crawling is active without provider evidence.

## Known bot split

The intended default mapping is:

| Purpose | Bot/token | Default |
| --- | --- | --- |
| OpenAI search/discovery | `OAI-SearchBot` | allow public pages |
| OpenAI user-directed fetch | `ChatGPT-User` | allow public pages |
| OpenAI model training | `GPTBot` | deny |
| Anthropic search/discovery | `Claude-SearchBot` | allow public pages |
| Anthropic user-directed fetch | `Claude-User` | allow public pages |
| Anthropic model training | `ClaudeBot` | deny |
| Google Search | `Googlebot` | allow public pages |
| Google Gemini extended use | `Google-Extended` | deny by default |

Provider names and behavior can change. Re-verify current provider documentation before changing production policy.

## Machine-readable discovery

When the deployment supports them, publish:

- `/robots.txt` — crawler-specific allow/deny rules plus sitemap location.
- `/sitemap.xml` — canonical public URLs only.
- `/llms.txt` — compact public product/source map where useful.
- `/crawlers.json` — project-local machine-readable statement of crawler intent.

For intentionally public Pages content, the current Content Signals intent is `search=yes, ai-input=yes, ai-train=no`: search indexing and real-time AI grounding/retrieval are allowed, while model training is not. Private/control-room Pages paths must override that public default with `search=no, ai-input=no, ai-train=no`.

These files and headers are discovery/policy surfaces, not authentication or authorization controls.

## Cloudflare economic layer

If the zone is eligible for AI Crawl Control:

- **Allow** crawlers that reliably create citations, referrals, or user value.
- **Block** crawlers that violate project policy or should not access the content.
- **Charge** selected AI crawlers only when Pay Per Crawl is actually available and enabled for the zone.
- Keep crawler discovery endpoints free when the provider requires or recommends it.
- Prefer path-based pricing only after measuring crawler demand and verifying that it does not damage normal search discovery.

## Upgrade checklist

For a new project:

1. classify the public pages;
2. protect private/auth surfaces independently of robots rules;
3. add the provider bot split above;
4. add canonical sitemap entries;
5. add `llms.txt` or `crawlers.json` only with public-safe truth;
6. add tests for the intended policy;
7. deploy;
8. verify the real runtime with HTTP/browser evidence;
9. inspect crawler/referral analytics;
10. only then consider charging crawler access.