import { createHash } from "node:crypto";

const SECRET_KEY_PATTERN = /(authorization|password|passwd|secret|token|api[_-]?key|service[_-]?role)/i;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

export function requestHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

export function assertNoSecretArguments(value: unknown, path = "arguments"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecretArguments(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new Error(`Secret-bearing argument key is not allowed: ${path}.${key}`);
    }
    assertNoSecretArguments(item, `${path}.${key}`);
  }
}
