import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = new URL('../../public/.well-known/', import.meta.url);
const manifestPath = fileURLToPath(new URL('lovable-project-surfaces.json', root));
const schemaPath = fileURLToPath(new URL('lovable-project-surfaces.schema.json', root));

interface JsonSchemaProperties {
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

describe('Lovable surface schema artifact', () => {
  it('keeps the public manifest and schema as non-secret bounded JSON artifacts', async () => {
    const [manifestRaw, schemaRaw] = await Promise.all([
      readFile(manifestPath, 'utf8'),
      readFile(schemaPath, 'utf8'),
    ]);

    expect(() => JSON.parse(manifestRaw)).not.toThrow();
    expect(() => JSON.parse(schemaRaw)).not.toThrow();
    expect(manifestRaw.length).toBeLessThan(20_000);
    expect(schemaRaw.length).toBeLessThan(20_000);

    for (const forbidden of [
      'api_key',
      'apikey',
      'authorization:',
      'bearer ',
      'password',
      'secret',
      'private_key',
      'BEGIN PRIVATE KEY',
    ]) {
      expect(manifestRaw.toLowerCase()).not.toContain(forbidden.toLowerCase());
      expect(schemaRaw.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('declares the authority-bearing fields as immutable false constants', async () => {
    const schema = JSON.parse(await readFile(schemaPath, 'utf8')) as {
      properties?: {
        bindings?: {
          items?: JsonSchemaProperties;
        };
      };
    };
    const itemProperties = schema.properties?.bindings?.items?.properties as Record<
      string,
      { const?: unknown }
    > | undefined;

    expect(itemProperties?.truthAuthority?.const).toBe(false);
    expect(itemProperties?.executionAllowed?.const).toBe(false);
    expect(itemProperties?.externalMutationAllowed?.const).toBe(false);
  });
});
