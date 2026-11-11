import { describe, expect, it, vi } from 'vitest';
import {
  generateElevenLabsImage,
  generateElevenLabsVideo,
  generateGeminiImage,
  generateGeminiVideo,
  generateOpenAiImage,
  uploadGeneratedMediaAsset,
} from '../mediaContentGenerator.js';

describe('generateOpenAiImage', () => {
  it('reports CAPABILITY_UNAVAILABLE when the key or model is not configured', async () => {
    const result = await generateOpenAiImage({ prompt: 'test' }, { env: {}, fetchImpl: vi.fn() as unknown as typeof fetch });
    expect(result.kind).toBe('CAPABILITY_UNAVAILABLE');
  });

  it('refuses when media generation is not explicitly enabled', async () => {
    const result = await generateOpenAiImage({ prompt: 'a cat' }, {
      env: { OPENAI_API_KEY: 'key', FCR_OPENAI_IMAGE_MODEL: 'gpt-image-2' },
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    expect(result.kind).toBe('CAPABILITY_UNAVAILABLE');
  });

  it('decodes a successful base64 image response and never leaks the key', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.openai.com/v1/images/generations');
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-key', 'Content-Type': 'application/json' });
      const serialized = String(init?.body ?? '');
      expect(serialized).not.toContain('test-key');
      return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('fake-image-bytes').toString('base64') }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const result = await generateOpenAiImage({ prompt: 'a picture of a founder' }, {
      env: { OPENAI_API_KEY: 'test-key', FCR_OPENAI_IMAGE_MODEL: 'gpt-image-2', FCR_MEDIA_GENERATION_ENABLED: 'true' },
      fetchImpl: fetchMock,
    });
    expect(result.kind).toBe('SUCCESS');
    if (result.kind === 'SUCCESS') {
      expect(result.bytes.toString()).toBe('fake-image-bytes');
      expect(result.contentType).toBe('image/png');
    }
  });

  it('rejects a non-2xx response with a status-only message', async () => {
    const fetchMock = vi.fn(async () => new Response('secret provider payload', { status: 500 })) as typeof fetch;
    const result = await generateOpenAiImage({ prompt: 'x' }, {
      env: { OPENAI_API_KEY: 'test-key', FCR_OPENAI_IMAGE_MODEL: 'gpt-image-2', FCR_MEDIA_GENERATION_ENABLED: 'true' },
      fetchImpl: fetchMock,
    });
    expect(result.kind).toBe('FAILED');
    if (result.kind === 'FAILED') expect(result.safeMessage).toContain('HTTP 500');
  });
});

describe('generateGeminiImage', () => {
  it('decodes inlineData from the candidates/parts response shape', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3-image:generateContent');
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: Buffer.from('gemini-bytes').toString('base64') } }] } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    const result = await generateGeminiImage({ prompt: 'x' }, {
      env: { GEMINI_API_KEY: 'key', FCR_GEMINI_IMAGE_MODEL: 'gemini-3-image', FCR_MEDIA_GENERATION_ENABLED: 'true' },
      fetchImpl: fetchMock,
    });
    expect(result.kind).toBe('SUCCESS');
    if (result.kind === 'SUCCESS') expect(result.bytes.toString()).toBe('gemini-bytes');
  });

  it('fails when no part contains inline image data', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [] } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;
    const result = await generateGeminiImage({ prompt: 'x' }, {
      env: { GEMINI_API_KEY: 'key', FCR_GEMINI_IMAGE_MODEL: 'gemini-3-image', FCR_MEDIA_GENERATION_ENABLED: 'true' },
      fetchImpl: fetchMock,
    });
    expect(result.kind).toBe('FAILED');
  });
});

describe('generateGeminiVideo', () => {
  it('polls the operation until done and decodes the video bytes', async () => {
    let pollCount = 0;
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes('predictLongRunning')) {
        return new Response(JSON.stringify({ name: 'operations/op-123' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      pollCount += 1;
      if (pollCount < 2) {
        return new Response(JSON.stringify({ name: 'operations/op-123', done: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        name: 'operations/op-123',
        done: true,
        response: { generateVideoResponse: { generatedSamples: [{ video: { bytesBase64Encoded: Buffer.from('video-bytes').toString('base64'), mimeType: 'video/mp4' } }] } },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    const result = await generateGeminiVideo({ prompt: 'x' }, {
      env: { GEMINI_API_KEY: 'key', FCR_GEMINI_VIDEO_MODEL: 'veo-3', FCR_MEDIA_GENERATION_ENABLED: 'true' },
      fetchImpl: fetchMock,
      pollTimingMsForTests: { timeoutMs: 1000, intervalMs: 1 },
    });
    expect(result.kind).toBe('SUCCESS');
    if (result.kind === 'SUCCESS') {
      expect(result.contentType).toBe('video/mp4');
      expect(result.bytes.toString()).toBe('video-bytes');
    }
  });

  it('times out cleanly when the operation never completes', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes('predictLongRunning')) {
        return new Response(JSON.stringify({ name: 'operations/op-stuck' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ name: 'operations/op-stuck', done: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    const result = await generateGeminiVideo({ prompt: 'x' }, {
      env: { GEMINI_API_KEY: 'key', FCR_GEMINI_VIDEO_MODEL: 'veo-3', FCR_MEDIA_GENERATION_ENABLED: 'true' },
      fetchImpl: fetchMock,
      pollTimingMsForTests: { timeoutMs: 20, intervalMs: 5 },
    });
    expect(result.kind).toBe('FAILED');
    if (result.kind === 'FAILED') expect(result.code).toBe('GEMINI_VIDEO_POLL_TIMEOUT');
  });

  it('surfaces an operation-level error', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('predictLongRunning')) {
        return new Response(JSON.stringify({ name: 'operations/op-err' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ name: 'operations/op-err', done: true, error: { message: 'quota exceeded' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    const result = await generateGeminiVideo({ prompt: 'x' }, {
      env: { GEMINI_API_KEY: 'key', FCR_GEMINI_VIDEO_MODEL: 'veo-3', FCR_MEDIA_GENERATION_ENABLED: 'true' },
      fetchImpl: fetchMock,
      pollTimingMsForTests: { timeoutMs: 1000, intervalMs: 1 },
    });
    expect(result.kind).toBe('FAILED');
    if (result.kind === 'FAILED') expect(result.safeMessage).toBe('quota exceeded');
  });
});

describe('generateElevenLabsImage', () => {
  it('downloads the signed result URL after a completed response', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr === 'https://api.elevenlabs.io/v1/flows/image') {
        expect(init?.headers).toMatchObject({ 'xi-api-key': 'key' });
        return new Response(JSON.stringify({ status: 'completed', result_url: 'https://cdn.elevenlabs.io/asset-123.png' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr === 'https://cdn.elevenlabs.io/asset-123.png') {
        return new Response(new Uint8Array([9, 9, 9]), { status: 200, headers: { 'Content-Type': 'image/png' } });
      }
      throw new Error(`unexpected url ${urlStr}`);
    }) as typeof fetch;

    const result = await generateElevenLabsImage({ prompt: 'x' }, {
      env: { ELEVENLABS_API_KEY: 'key', FCR_ELEVENLABS_IMAGE_MODEL: 'eleven-image-1', FCR_MEDIA_GENERATION_ENABLED: 'true' },
      fetchImpl: fetchMock,
    });
    expect(result.kind).toBe('SUCCESS');
    if (result.kind === 'SUCCESS') expect(result.contentType).toBe('image/png');
  });

  it('rejects a non-HTTPS result URL from the provider', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 'completed', result_url: 'http://insecure.example.com/x.png' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;

    const result = await generateElevenLabsImage({ prompt: 'x' }, {
      env: { ELEVENLABS_API_KEY: 'key', FCR_ELEVENLABS_IMAGE_MODEL: 'eleven-image-1', FCR_MEDIA_GENERATION_ENABLED: 'true' },
      fetchImpl: fetchMock,
    });
    expect(result.kind).toBe('FAILED');
    if (result.kind === 'FAILED') expect(result.code).toBe('MEDIA_ASSET_URL_INSECURE');
  });
});

describe('generateElevenLabsVideo', () => {
  it('polls the job until completed and downloads the result', async () => {
    let pollCount = 0;
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr === 'https://api.elevenlabs.io/v1/flows/video') {
        return new Response(JSON.stringify({ id: 'job-123' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (urlStr === 'https://api.elevenlabs.io/v1/flows/video/job-123') {
        pollCount += 1;
        if (pollCount < 2) {
          return new Response(JSON.stringify({ status: 'processing' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ status: 'completed', result_url: 'https://cdn.elevenlabs.io/video-123.mp4' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr === 'https://cdn.elevenlabs.io/video-123.mp4') {
        return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'video/mp4' } });
      }
      throw new Error(`unexpected url ${urlStr}`);
    }) as typeof fetch;

    const result = await generateElevenLabsVideo({ prompt: 'x' }, {
      env: { ELEVENLABS_API_KEY: 'key', FCR_ELEVENLABS_VIDEO_MODEL: 'eleven-video-1', FCR_MEDIA_GENERATION_ENABLED: 'true' },
      fetchImpl: fetchMock,
      pollTimingMsForTests: { timeoutMs: 1000, intervalMs: 1 },
    });
    expect(result.kind).toBe('SUCCESS');
    if (result.kind === 'SUCCESS') expect(result.contentType).toBe('video/mp4');
  });

  it('fails when the job reports a failed status', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr === 'https://api.elevenlabs.io/v1/flows/video') {
        return new Response(JSON.stringify({ id: 'job-456' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ status: 'failed', error: 'content policy violation' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    const result = await generateElevenLabsVideo({ prompt: 'x' }, {
      env: { ELEVENLABS_API_KEY: 'key', FCR_ELEVENLABS_VIDEO_MODEL: 'eleven-video-1', FCR_MEDIA_GENERATION_ENABLED: 'true' },
      fetchImpl: fetchMock,
      pollTimingMsForTests: { timeoutMs: 1000, intervalMs: 1 },
    });
    expect(result.kind).toBe('FAILED');
    if (result.kind === 'FAILED') expect(result.safeMessage).toBe('content policy violation');
  });
});

describe('uploadGeneratedMediaAsset', () => {
  it('uploads to the bucket and returns a URL pointing at the media-assets route', async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const asset = await uploadGeneratedMediaAsset(
      { put },
      'https://api.foundercontrolroom.org',
      { bytes: Buffer.from('bytes'), contentType: 'image/png' },
    );
    expect(put).toHaveBeenCalledTimes(1);
    const [key, bytes, options] = put.mock.calls[0];
    expect(typeof key).toBe('string');
    expect(key.endsWith('.png')).toBe(true);
    expect(bytes).toBeInstanceOf(Buffer);
    expect(options).toMatchObject({ httpMetadata: { contentType: 'image/png' } });
    expect(asset.type).toBe('image');
    expect(asset.url).toBe(`https://api.foundercontrolroom.org/media-assets/${key}`);
  });

  it('classifies a video content type correctly', async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const asset = await uploadGeneratedMediaAsset(
      { put },
      'https://api.foundercontrolroom.org',
      { bytes: Buffer.from('bytes'), contentType: 'video/mp4' },
    );
    expect(asset.type).toBe('video');
  });
});
