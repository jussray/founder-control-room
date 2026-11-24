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

function decodePointerSegment(value: string): string {
  return value.replace(/~1/g, '/').replace(/~0/g, '~');
}

function resolveLocalRef(root: JsonSchema, ref: string, path: string): unknown {
  if (ref === '#') return root;
  if (!ref.startsWith('#/')) {
    throw new StructuredSchemaError(`${path}: only local JSON Schema references are supported`);
  }

  let current: unknown = root;
  for (const encodedSegment of ref.slice(2).split('/')) {
    const segment = decodePointerSegment(encodedSegment);
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        throw new StructuredSchemaError(`${path}: unresolved schema reference ${ref}`);
      }
      current = current[index];
      continue;
    }
    if (!isRecord(current) || !(segment in current)) {
      throw new StructuredSchemaError(`${path}: unresolved schema reference ${ref}`);
    }
    current = current[segment];
  }
  return current;
}

function assertAnthropicReferenceSafety(
  root: JsonSchema,
  value: unknown,
  path: string,
  activeRefs: readonly string[] = [],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertAnthropicReferenceSafety(root, item, `${path}[${index}]`, activeRefs);
    });
    return;
  }
  if (!isRecord(value)) return;

  if ('$ref' in value) {
    if (typeof value.$ref !== 'string' || !value.$ref.trim()) {
      throw new StructuredSchemaError(`${path}: schema reference must be a non-empty string`);
    }
    const ref = value.$ref.trim();
    if (/^https?:\/\//i.test(ref) || !ref.startsWith('#')) {
      throw new StructuredSchemaError(`${path}: external schema references are not supported by Anthropic structured outputs`);
    }
    if (activeRefs.includes(ref)) {
      throw new StructuredSchemaError(`${path}: recursive schema reference ${ref} is not supported by Anthropic structured outputs`);
    }

    const resolved = resolveLocalRef(root, ref, path);
    assertAnthropicReferenceSafety(root, resolved, `${path}->$ref(${ref})`, [...activeRefs, ref]);
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === '$ref') continue;
    if ((key === 'properties' || key === '$defs' || key === 'definitions' || key === 'dependentSchemas') && isRecord(child)) {
      for (const [name, schema] of Object.entries(child)) {
        assertAnthropicReferenceSafety(root, schema, `${path}.${key}.${name}`, activeRefs);
      }
    } else if (['items', 'additionalItems', 'additionalProperties', 'not', 'if', 'then', 'else', 'contentSchema', 'contains', 'propertyNames'].includes(key)) {
      assertAnthropicReferenceSafety(root, child, `${path}.${key}`, activeRefs);
    } else if (['prefixItems', 'allOf', 'anyOf', 'oneOf'].includes(key) && Array.isArray(child)) {
      child.forEach((schema, index) => assertAnthropicReferenceSafety(root, schema, `${path}.${key}[${index}]`, activeRefs));
    }
  }
}

const SCHEMA_MAP_KEYS = new Set(['properties', '$defs', 'definitions', 'dependentSchemas']);
const SCHEMA_VALUE_KEYS = new Set([
  'items', 'additionalItems', 'additionalProperties', 'not', 'if', 'then', 'else',
  'contentSchema',
]);
const SCHEMA_ARRAY_KEYS = new Set(['prefixItems', 'allOf', 'anyOf', 'oneOf']);

function cloneForAnthropic(value: unknown, path: string): unknown {
  if (!isRecord(value)) return value;

  const result: JsonSchema = {};
  for (const [key, child] of Object.entries(value)) {
    if (ANTHROPIC_UNSUPPORTED_KEYWORDS.has(key)) continue;
    if (key === 'minItems') {
      if (child === 0 || child === 1) result[key] = child;
      continue;
    }
    if (SCHEMA_MAP_KEYS.has(key) && isRecord(child)) {
      // Names in "properties" and "$defs" are user-defined, not schema keywords.
      result[key] = Object.fromEntries(
        Object.entries(child).map(([name, schema]) =>
          [name, cloneForAnthropic(schema, `${path}.${key}.${name}`)]),
      );
    } else if (SCHEMA_VALUE_KEYS.has(key)) {
      result[key] = cloneForAnthropic(child, `${path}.${key}`);
    } else if (SCHEMA_ARRAY_KEYS.has(key) && Array.isArray(child)) {
      result[key] = child.map((schema, index) =>
        cloneForAnthropic(schema, `${path}.${key}[${index}]`));
    } else {
      // Literal values in const/enum/default/examples must not be rewritten.
      result[key] = child;
    }
  }

  const schemaType = result.type;
  const isObject = schemaType === 'object'
    || (Array.isArray(schemaType) && schemaType.includes('object'));
  if (isObject) result.additionalProperties = false;
  return result;
}

/**
 * Anthropic's grammar compiler accepts a narrower JSON Schema subset than the
 * runtime validators used by FCR. Strip only generation-time constraints that
 * Anthropic documents as unsupported; application validators remain
 * authoritative for those same bounds after parsing. Circular references fail
 * closed before provider dispatch; acyclic local references remain available.
 */
export function compileAnthropicStructuredSchema(schema: JsonSchema): JsonSchema {
  assertAnthropicReferenceSafety(schema, schema, '$');
  const compiled = cloneForAnthropic(schema, '$');
  if (!isRecord(compiled)) {
    throw new StructuredSchemaError('Structured output schema must compile to an object');
  }
  return compiled;
}
