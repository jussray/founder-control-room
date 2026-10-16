type JsonRecord = Record<string, unknown>;

export interface PairedOAuthResponseContext {
  method?: string;
  scope: string;
  challenge?: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function securitySchemes(scope: string) {
  return [{ type: 'oauth2', scopes: [scope] }];
}

/**
 * Edge-only metadata adapter for the canonical OAuth `/mcp` lane.
 *
 * The underlying FCR tool contracts stay provider-neutral. The paired remote
 * lane advertises the same OAuth requirement on every tool so ChatGPT can
 * surface linking UI while Claude and other MCP clients can safely ignore the
 * additive metadata. Runtime authorization remains enforced by the MCP handler.
 */
export function decoratePairedOAuthResponse(
  body: unknown,
  context: PairedOAuthResponseContext,
): unknown {
  if (!isRecord(body)) return body;

  let decorated: JsonRecord = { ...body };

  if (context.method === 'tools/list' && isRecord(decorated.result)) {
    const result = decorated.result;
    if (Array.isArray(result.tools)) {
      decorated = {
        ...decorated,
        result: {
          ...result,
          tools: result.tools.map((tool) => (
            isRecord(tool)
              ? { ...tool, securitySchemes: securitySchemes(context.scope) }
              : tool
          )),
        },
      };
    }
  }

  if (context.challenge && isRecord(decorated.error)) {
    const error = decorated.error;
    const data = isRecord(error.data) ? error.data : {};
    const meta = isRecord(data._meta) ? data._meta : {};
    decorated = {
      ...decorated,
      error: {
        ...error,
        data: {
          ...data,
          _meta: {
            ...meta,
            'mcp/www_authenticate': [context.challenge],
          },
        },
      },
    };
  }

  return decorated;
}
