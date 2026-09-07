export class StructuredSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StructuredSchemaError';
  }
}

type JsonSchema = Record<string, unknown>;

const ANTHROPIC_UNSUPPORTED_KEYWORDS = new Set([
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'maxItems',
  'uniqueItems',
  'minProperties',
  'maxProperties',
  'contains',
  'minContains',
  'maxContains',
  'unevaluatedItems',
  'patternProperties',
  'unevaluatedProperties',
  'propertyNames',
]);

function isRecord(value: unknown): value is JsonSchema {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneForAnthropic(value: unknown, path: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => cloneForAnthropic(item, `${path}[${index}]`));
  }
  if (!isRecord(value)) return value;

  if (value.$ref === '#') {
    throw new StructuredSchemaError(`${path}: recursive root references are not supported by Anthropic structured outputs`);
  }
  if (typeof value.$ref === 'string' && /^https?:\/\//i.test(value.$ref)) {
    throw new StructuredSchemaError(`${path}: external schema references are not supported by Anthropic structured outputs`);
  }

  const result: JsonSchema = {};
  for (const [key, child] of Object.entries(value)) {
    if (ANTHROPIC_UNSUPPORTED_KEYWORDS.has(key)) continue;
    if (key === 'minItems') {
      if (child === 0 || child === 1) result[key] = child;
      continue;
    }
    result[key] = cloneForAnthropic(child, `${path}.${key}`);
  }

  const schemaType = result.type;
  const isObject = schemaType === 'object'
    || (Array.isArray(schemaType) && schemaType.includes('object'));
  if (isObject) {
    result.additionalProperties = false;
  }

  return result;
}

/**
 * Anthropic's grammar compiler accepts a narrower JSON Schema subset than the
 * runtime validators used by FCR. Strip only generation-time constraints that
 * Anthropic documents as unsupported; application validators remain
 * authoritative for those same bounds after parsing.
 */
export function compileAnthropicStructuredSchema(schema: JsonSchema): JsonSchema {
  const compiled = cloneForAnthropic(schema, '$');
  if (!isRecord(compiled)) {
    throw new StructuredSchemaError('Structured output schema must compile to an object');
  }
  return compiled;
}
