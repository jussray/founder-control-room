import type { StructuredProviderName } from './structuredProvider.js';

export class ToolArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolArgumentError';
  }
}

interface PendingToolArguments {
  provider: StructuredProviderName;
  callId: string;
  toolName: string;
  chunks: string[];
  byteCount: number;
}

function callKey(provider: StructuredProviderName, callId: string): string {
  return `${provider}:${callId}`;
}

function parseObject(raw: string, toolName: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new ToolArgumentError(
      `Completed arguments for ${toolName} are invalid JSON: ${error instanceof Error ? error.message : 'parse failed'}`,
    );
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ToolArgumentError(`Completed arguments for ${toolName} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

export class ToolArgumentAssembler {
  private readonly pending = new Map<string, PendingToolArguments>();

  constructor(private readonly maxBytes = 64 * 1024) {}

  start(provider: StructuredProviderName, callId: string, toolName: string): void {
    if (!callId.trim() || !toolName.trim()) {
      throw new ToolArgumentError('Tool call identity is required');
    }
    const key = callKey(provider, callId);
    if (this.pending.has(key)) {
      throw new ToolArgumentError(`Duplicate streamed tool call: ${key}`);
    }
    this.pending.set(key, {
      provider,
      callId,
      toolName,
      chunks: [],
      byteCount: 0,
    });
  }

  append(provider: StructuredProviderName, callId: string, fragment: string): void {
    const key = callKey(provider, callId);
    const current = this.pending.get(key);
    if (!current) {
      throw new ToolArgumentError(`Argument delta arrived for unknown tool call: ${key}`);
    }

    const fragmentBytes = Buffer.byteLength(fragment, 'utf8');
    if (current.byteCount + fragmentBytes > this.maxBytes) {
      this.pending.delete(key);
      throw new ToolArgumentError(`Tool arguments for ${current.toolName} exceed ${this.maxBytes} bytes`);
    }

    current.chunks.push(fragment);
    current.byteCount += fragmentBytes;
  }

  finish(
    provider: StructuredProviderName,
    callId: string,
    finalArguments?: string,
  ): { toolName: string; arguments: Record<string, unknown> } {
    const key = callKey(provider, callId);
    const current = this.pending.get(key);
    if (!current) {
      throw new ToolArgumentError(`Tool completion arrived for unknown tool call: ${key}`);
    }
    this.pending.delete(key);

    const raw = finalArguments ?? current.chunks.join('');
    if (Buffer.byteLength(raw, 'utf8') > this.maxBytes) {
      throw new ToolArgumentError(`Tool arguments for ${current.toolName} exceed ${this.maxBytes} bytes`);
    }

    return {
      toolName: current.toolName,
      arguments: parseObject(raw || '{}', current.toolName),
    };
  }

  discard(provider: StructuredProviderName, callId: string): void {
    this.pending.delete(callKey(provider, callId));
  }
}
