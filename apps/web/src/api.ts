import { FeedResponse, Preference } from '@ai-job-search/shared';

/** Reads a JSON body and throws with the error envelope's message on a non-2xx status. */
async function readJson(res: Response): Promise<unknown> {
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (body as { error?: { message?: string } } | null)?.error?.message ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

export async function fetchFeed(signal?: AbortSignal): Promise<FeedResponse> {
  const res = await fetch('/api/feed', { signal, headers: { Accept: 'application/json' } });
  return FeedResponse.parse(await readJson(res));
}

export async function fetchPreference(signal?: AbortSignal): Promise<Preference> {
  const res = await fetch('/api/preference', { signal, headers: { Accept: 'application/json' } });
  return Preference.parse(await readJson(res));
}

export async function savePreference(p: Preference): Promise<Preference> {
  const res = await fetch('/api/preference', {
    method: 'PUT',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(p),
  });
  return Preference.parse(await readJson(res));
}
