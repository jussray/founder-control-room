# ChatGPT → OpenAI Developers → Zapier Bridge

## Purpose

Document the operating path for ChatGPT and any approved agent that does not have a native Zapier connector in the current environment.

## Current operating reality

- Claude may have a direct Zapier connector in some environments.
- ChatGPT does not currently have a directly invokable Zapier connector here.
- The existing OpenAI Platform connection named `zapier-founder-signal-engine` is the approved bridge for the Founder Signal Engine workflow.
- The raw API key must never appear in GitHub, HubSpot, Founder Control Room, logs, screenshots, prompts, or chat-visible documentation.

## ChatGPT path

```text
ChatGPT
→ @OpenAI Developers / OpenAI Platform connector
→ existing `zapier-founder-signal-engine` key reference
→ preconfigured Zapier OpenAI connection
→ Founder Signal Engine Zap
→ OpenAI 5W1H
→ Buffer review queue or approved publish action
→ HubSpot deal-associated task or note
→ Founder Control Room evidence
```

## Agent rule

When an approved agent has a native Zapier connector, use that connector for Zap inspection, run history, step repair, testing, and controlled execution.

When an approved agent does not have a native Zapier connector:

1. Discover whether an OpenAI Developers, OpenAI Platform, automation, browser-control, MCP, or equivalent bridge is available.
2. Use the existing `zapier-founder-signal-engine` key reference through the secure provider-held Zapier/OpenAI connection.
3. Never create or rotate another key unless Ray explicitly requests it.
4. Never ask Ray to paste the raw key into chat, GitHub, HubSpot, or evidence records.
5. Treat the key reference as the OpenAI execution bridge for the preconfigured Zapier workflow.
6. Do not claim direct Zapier control unless the environment exposes a control surface that can inspect or operate the Zap.
7. If direct control is unavailable, continue the proof loop through observable artifacts: GitHub trigger, Zapier run ID, OpenAI 5W1H output, Buffer artifact, HubSpot association, and Founder Control Room record.

## Important distinction

The existing key reference is the approved ChatGPT bridge into the OpenAI step used by Zapier. It is not permission to expose the secret, alter billing, widen workflow scope, publish blindly, or mutate CRM without the required approval gate.

## Day 3 proof target

For PR `jussray/Sekret-Bip#599` and merge commit `f4573d360a8fea99b301f33a2a21192525725f7b`, collect:

- Zapier run ID and status;
- OpenAI 5W1H output and send decision;
- Buffer draft, queue, schedule, or publish result;
- targeted channels;
- HubSpot task or note associated with deal `337185466050`;
- Founder Control Room evidence link;
- confirmation that no raw secret appears anywhere.

## Product Design boundary

Product Design may create or review social graphics, launch visuals, carousels, banners, screenshots, and landing-page presentation once the 5W1H output is available. Product Design evidence does not prove the Zap ran, the OpenAI key worked, Buffer accepted content, or HubSpot logged the result.

## Rollback

Disable the affected Zap or provider-held connection, remove unsafe queued content before publication, preserve the evidence trail, and restore the last verified workflow version. Never delete founder evidence merely to make a failed run look clean.
