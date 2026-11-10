import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  serverEnv: () => ({ GEMINI_API_KEY: 'test-key', GROQ_API_KEY: undefined }),
}));

const { estimateBaseValue } = await import('./llm');

const INPUT = { title: 'Dell 24" monitor', category: 'electronics', functionalStatus: 'fully_working' } as const;

const okBody = {
  candidates: [
    {
      content: {
        parts: [
          {
            text: JSON.stringify({
              item_identified: 'Dell 24-inch monitor',
              base_value_inr: 6500,
              confidence: 0.9,
              reasoning: ['Retails near ₹14,000 new in India.', 'Two years of use roughly halves that.'],
            }),
          },
        ],
      },
    },
  ],
};

const response = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function run() {
  const pending = estimateBaseValue(INPUT);
  await vi.runAllTimersAsync();
  return pending;
}

describe('estimateBaseValue retry', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('retries once after a rate limit and returns the second answer', async () => {
    fetchMock.mockResolvedValueOnce(response(429)).mockResolvedValueOnce(response(200, okBody));
    const result = await run();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result?.baseValue).toBe(6500);
    expect(result?.provider).toBe('gemini');
  });

  it('gives up after the second rate limit so the deterministic fallback takes over', async () => {
    fetchMock.mockResolvedValue(response(429));
    expect(await run()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a request the provider rejected as invalid', async () => {
    fetchMock.mockResolvedValue(response(400));
    expect(await run()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
