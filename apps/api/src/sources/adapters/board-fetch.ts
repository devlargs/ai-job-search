/** Shared HTTP plumbing for the board adapters: one User-Agent, one timeout, non-2xx throws. */

export type FetchFn = typeof globalThis.fetch;

export const USER_AGENT = 'ai-job-search-local';
export const FETCH_TIMEOUT_MS = 30_000;

/** GETs `url` and returns the response. Throws with the board name and status on a non-2xx. */
export async function getBoard(fetchFn: FetchFn, url: string, board: string, accept: string): Promise<Response> {
  const res = await fetchFn(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: accept },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`${board} responded ${res.status}`);
  }
  return res;
}

/** GETs `url` and parses the body as JSON. Throws on a non-2xx or an unparseable body. */
export async function getBoardJson(fetchFn: FetchFn, url: string, board: string): Promise<unknown> {
  const res = await getBoard(fetchFn, url, board, 'application/json');
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${board} response is not valid JSON`);
  }
}

/** Parses an ISO or RFC 822 date string. Returns null when missing or unparseable. */
export function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const date = new Date(value.trim());
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A trimmed string, or '' when the value is not a string. */
export function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** A non-empty id as a string (numbers allowed), or null. */
export function idString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
