import { RELAY_V31_LIMITS, RelayV31Error } from './v31-types.js';

function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new RelayV31Error(code);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function canonicalizeRelayJcsV31(value: unknown): string {
  return canonicalize(value, 0, new WeakSet<object>());
}

function canonicalize(value: unknown, depth: number, seen: WeakSet<object>): string {
  assert(depth <= RELAY_V31_LIMITS.maxJcsDepth, 'relay_jcs_depth');
  if (value === null) return 'null';

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number': {
      assert(Number.isFinite(value), 'relay_jcs_nonfinite');
      const serialized = JSON.stringify(value);
      assert(serialized !== undefined, 'relay_jcs_number_serialize');
      return serialized;
    }
    case 'string':
      return canonicalizeString(value);
    case 'undefined':
      throw new RelayV31Error('relay_jcs_undefined');
    case 'function':
    case 'symbol':
    case 'bigint':
      throw new RelayV31Error('relay_jcs_type');
  }

  assert(typeof value === 'object', 'relay_jcs_type');
  const objectValue = value as object;
  assert(!seen.has(objectValue), 'relay_jcs_cycle');
  seen.add(objectValue);

  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalize(item, depth + 1, seen)).join(',')}]`;
    }

    assert(isPlainRecord(value), 'relay_jcs_nonplain_object');
    const keys = Object.keys(value).sort();
    const entries = keys.map((key) => {
      const item = value[key];
      assert(item !== undefined, 'relay_jcs_undefined_prop');
      return `${canonicalizeString(key)}:${canonicalize(item, depth + 1, seen)}`;
    });
    return `{${entries.join(',')}}`;
  } finally {
    seen.delete(objectValue);
  }
}

function canonicalizeString(value: string): string {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = index + 1 < value.length ? value.charCodeAt(index + 1) : 0;
      assert(next >= 0xdc00 && next <= 0xdfff, 'relay_jcs_lone_surrogate');
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new RelayV31Error('relay_jcs_lone_surrogate');
    }
  }
  return JSON.stringify(value);
}
