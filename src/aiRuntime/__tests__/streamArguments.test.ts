import { describe, expect, it } from 'vitest';
import { ToolArgumentAssembler, ToolArgumentError } from '../streamArguments.js';

describe('ToolArgumentAssembler', () => {
  it('keeps interleaved provider tool calls isolated by provider and call id', () => {
    const assembler = new ToolArgumentAssembler();
    assembler.start('openai', 'call_1', 'lookup_project');
    assembler.start('anthropic', 'call_1', 'lookup_contact');

    assembler.append('openai', 'call_1', '{"project');
    assembler.append('anthropic', 'call_1', '{"contact');
    assembler.append('openai', 'call_1', '_id":"p1"}');
    assembler.append('anthropic', 'call_1', '_id":"c1"}');

    expect(assembler.finish('openai', 'call_1')).toEqual({
      toolName: 'lookup_project',
      arguments: { project_id: 'p1' },
    });
    expect(assembler.finish('anthropic', 'call_1')).toEqual({
      toolName: 'lookup_contact',
      arguments: { contact_id: 'c1' },
    });
  });

  it('parses only after the complete JSON object has arrived', () => {
    const assembler = new ToolArgumentAssembler();
    assembler.start('openai', 'call_2', 'search');
    assembler.append('openai', 'call_2', '{"query":"found');
    assembler.append('openai', 'call_2', 'er control room"}');

    expect(assembler.finish('openai', 'call_2')).toEqual({
      toolName: 'search',
      arguments: { query: 'founder control room' },
    });
  });

  it('uses an authoritative final argument payload instead of appending it twice', () => {
    const assembler = new ToolArgumentAssembler();
    assembler.start('openai', 'call_3', 'lookup');
    assembler.append('openai', 'call_3', '{"id":"abc"}');

    expect(assembler.finish('openai', 'call_3', '{"id":"abc"}')).toEqual({
      toolName: 'lookup',
      arguments: { id: 'abc' },
    });
  });

  it('rejects an argument stream that exceeds the byte budget and discards it', () => {
    const assembler = new ToolArgumentAssembler(8);
    assembler.start('anthropic', 'toolu_1', 'bounded');

    expect(() => assembler.append('anthropic', 'toolu_1', '{"value":"too large"}')).toThrow(ToolArgumentError);
    expect(() => assembler.finish('anthropic', 'toolu_1')).toThrow(/unknown tool call/);
  });

  it('rejects completion for a call that never started', () => {
    const assembler = new ToolArgumentAssembler();
    expect(() => assembler.finish('openai', 'missing')).toThrow(/unknown tool call/);
  });
});
