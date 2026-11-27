import { FeedResponse } from '@ai-job-search/shared';

export async function fetchFeed(signal?: AbortSignal): Promise<FeedResponse> {
  const res = await fetch('/api/feed', { signal, headers: { Accept: 'application/json' } });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (body as { error?: { message?: string } } | null)?.error?.message ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  return FeedResponse.parse(body);
}
