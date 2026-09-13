import { describe, expect, it } from 'vitest';
import { compileAnthropicStructuredSchema, StructuredSchemaError } from '../schemaCompiler.js';

describe('compileAnthropicStructuredSchema', () => {
  it('strips unsupported grammar constraints while preserving closed structure and enums', () => {
    const compiled = compileAnthropicStructuredSchema({
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 120 },
        score: { type: 'number', minimum: 0, maximum: 1 },
        tags: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          uniqueItems: true,
          items: { type: 'string', enum: ['money', 'build'] },
        },
      },
      required: ['name', 'score', 'tags'],
      additionalProperties: false,
    });

    expect(compiled).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        score: { type: 'number' },
        tags: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', enum: ['money', 'build'] },
        },
      },
      required: ['name', 'score', 'tags'],
      additionalProperties: false,
    });
  });

  it('removes unsupported minItems values greater than one', () => {
    expect(compileAnthropicStructuredSchema({
      type: 'array',
      minItems: 2,
      items: { type: 'string' },
    })).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
  });

  it('rejects direct recursive root references instead of silently weakening them', () => {
    expect(() => compileAnthropicStructuredSchema({
      type: 'object',
      properties: {
        children: { type: 'array', items: { $ref: '#' } },
      },
      required: ['children'],
      additionalProperties: false,
    })).toThrow(StructuredSchemaError);
  });

  it('rejects Pydantic-style indirect circular references in $defs', () => {
    expect(() => compileAnthropicStructuredSchema({
      $defs: {
        TreeNode: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            children: {
              type: 'array',
              items: { $ref: '#/$defs/TreeNode' },
            },
          },
          required: ['name', 'children'],
          additionalProperties: false,
        },
      },
      $ref: '#/$defs/TreeNode',
    })).toThrow(/recursive schema reference/);
  });

  it('preserves acyclic local references', () => {
    expect(compileAnthropicStructuredSchema({
      $defs: {
        Label: { type: 'string', maxLength: 120 },
      },
      type: 'object',
      properties: {
        label: { $ref: '#/$defs/Label' },
      },
      required: ['label'],
      additionalProperties: false,
    })).toEqual({
      $defs: {
        Label: { type: 'string' },
      },
      type: 'object',
      properties: {
        label: { $ref: '#/$defs/Label' },
      },
      required: ['label'],
      additionalProperties: false,
    });
  });

  it('rejects external references before provider dispatch', () => {
    expect(() => compileAnthropicStructuredSchema({
      $ref: 'https://example.com/schema.json',
    })).toThrow(/external schema references/);
  });
});
