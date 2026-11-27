import type { ListingDraft, SourceId } from '@ai-job-search/shared';
import type { JobSource } from '../job-source.port.js';

export const REMOTIVE_URL = 'https://remotive.com/api/remote-jobs';

type FetchFn = typeof globalThis.fetch;

interface RemotiveJob {
  id: number | string;
  url: string;
  title: string;
  company_name: string;
  description: string;
  candidate_required_location?: string | null;
  publication_date?: string | null;
}

/**
 * Parses a Remotive date. Remotive sends `YYYY-MM-DDTHH:mm:ss` with no zone;
 * it is treated as UTC. Returns null when unparseable.
 */
export function parseRemotiveDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const date = new Date(hasZone ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Remotive public API. Terms: link back to the Remotive url, credit Remotive,
 * and request at most about 4 times a day (hence minIntervalMin 360).
 * Remotive has no "since" filter, so `since` is accepted and ignored.
 */
export class RemotiveAdapter implements JobSource {
  readonly id: SourceId = 'remotive';
  readonly minIntervalMin = 360;

  constructor(
    private readonly url: string = REMOTIVE_URL,
    private readonly fetchFn: FetchFn = globalThis.fetch.bind(globalThis),
  ) {}

  async fetch(_since: Date | null): Promise<ListingDraft[]> {
    const res = await this.fetchFn(this.url, {
      headers: { 'User-Agent': 'ai-job-search-local', Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(`Remotive responded ${res.status}`);
    }
    const body = (await res.json()) as { jobs?: unknown };
    if (!Array.isArray(body?.jobs)) {
      throw new Error('Remotive response has no jobs array');
    }
    return (body.jobs as RemotiveJob[]).map((job) => this.toDraft(job));
  }

  private toDraft(job: RemotiveJob): ListingDraft {
    const location = job.candidate_required_location?.trim() ?? '';
    return {
      sourceJobId: String(job.id),
      url: job.url,
      title: job.title,
      company: (job.company_name ?? '').trim(),
      descriptionHtml: job.description ?? '',
      locationText: location === '' ? null : location,
      locationTags: [],
      postedAt: parseRemotiveDate(job.publication_date),
    };
  }
}
