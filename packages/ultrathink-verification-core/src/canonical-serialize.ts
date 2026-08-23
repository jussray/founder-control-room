type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

function canonicalize(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('CANONICAL_SERIALIZE_INVALID: non-finite number');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) result[key] = canonicalize(item);
    }
    return result;
  }
  throw new Error(`CANONICAL_SERIALIZE_INVALID: unsupported ${typeof value}`);
}

export function canonicalSerialize(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
