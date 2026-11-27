import type { ListingDraft, SourceId } from '@ai-job-search/shared';
import type { JobSource } from '../job-source.port.js';
import { getBoardJson, isRecord, str, type FetchFn } from './board-fetch.js';

export const HIMALAYAS_URL = 'https://himalayas.app/jobs/api?limit=20';
/** Pages fetched per run, the first run included. The full feed holds ~117k jobs. */
export const HIMALAYAS_MAX_PAGES = 5;

/**
 * Himalayas public jobs API. Terms: Apply uses `applicationLink` unchanged, and
 * the app shows a visible link to Himalayas. Each run takes the newest
 * HIMALAYAS_MAX_PAGES pages via `nextCursor`; `since` is ignored so still-open
 * listings keep a fresh lastSeenAt.
 */
export class HimalayasAdapter implements JobSource {
  readonly id: SourceId = 'himalayas';
  readonly minIntervalMin = 30;

  constructor(
    private readonly url: string = HIMALAYAS_URL,
    private readonly fetchFn: FetchFn = globalThis.fetch.bind(globalThis),
  ) {}

  async fetch(_since: Date | null): Promise<ListingDraft[]> {
    const drafts: ListingDraft[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < HIMALAYAS_MAX_PAGES; page++) {
      const body = await getBoardJson(this.fetchFn, pageUrl(this.url, cursor), 'Himalayas');
      if (!isRecord(body) || !Array.isArray(body.jobs)) {
        throw new Error('Himalayas response has no jobs array');
      }
      for (const job of body.jobs) {
        const draft = toDraft(job);
        if (draft) drafts.push(draft);
      }
      cursor = typeof body.nextCursor === 'string' && body.nextCursor !== '' ? body.nextCursor : null;
      if (!cursor) break;
    }
    return drafts;
  }
}

function pageUrl(base: string, cursor: string | null): string {
  if (!cursor) return base;
  const url = new URL(base);
  url.searchParams.set('cursor', cursor);
  return url.toString();
}

function toDraft(job: unknown): ListingDraft | null {
  if (!isRecord(job)) return null;
  const sourceJobId = str(job.guid);
  const url = typeof job.applicationLink === 'string' ? job.applicationLink : '';
  if (!sourceJobId || !url) return null;
  const tags = Array.isArray(job.locationRestrictions)
    ? job.locationRestrictions.filter((t): t is string => typeof t === 'string' && t.trim() !== '')
    : [];
  return {
    sourceJobId,
    url,
    title: str(job.title),
    company: str(job.companyName),
    descriptionHtml: typeof job.description === 'string' ? job.description : '',
    locationText: null,
    locationTags: tags,
    postedAt: typeof job.pubDate === 'number' && Number.isFinite(job.pubDate) ? new Date(job.pubDate * 1000) : null,
  };
}
