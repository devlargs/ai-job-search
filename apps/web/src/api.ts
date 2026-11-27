import { FeedResponse, ListingDetail, Preference } from '@ai-job-search/shared';

/** A failed API call, carrying the HTTP status so a view can tell "not found" apart. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get notFound(): boolean {
    return this.status === 404;
  }
}

/** Reads a JSON body and throws with the error envelope's message on a non-2xx status. */
async function readJson(res: Response): Promise<unknown> {
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (body as { error?: { message?: string } } | null)?.error?.message ?? `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
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

export async function fetchListing(id: string, signal?: AbortSignal): Promise<ListingDetail> {
  const res = await fetch(`/api/listings/${encodeURIComponent(id)}`, { signal, headers: { Accept: 'application/json' } });
  return ListingDetail.parse(await readJson(res));
}
