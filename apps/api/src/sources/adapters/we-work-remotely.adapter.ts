import type { ListingDraft, SourceId } from '@ai-job-search/shared';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { JobSource } from '../job-source.port.js';
import { getBoard, isRecord, parseDate, str, type FetchFn } from './board-fetch.js';

export const WWR_URL = 'https://weworkremotely.com/remote-jobs.rss';

const parser = new XMLParser({
  ignoreAttributes: true,
  // Keep every value a string: a title like "2025" must not become a number.
  parseTagValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  isArray: (name, jpath) => jpath === 'rss.channel.item',
});

/** Splits WWR's "Company: Title" on the first ": ". With no ": ", company is ''. */
export function splitWwrTitle(raw: string): { company: string; title: string } {
  const at = raw.indexOf(': ');
  if (at === -1) return { company: '', title: raw.trim() };
  return { company: raw.slice(0, at).trim(), title: raw.slice(at + 2).trim() };
}

/**
 * We Work Remotely RSS feed. One feed of the current ~100 items, no paging, so
 * every run takes the whole window and `since` is ignored. The feed's
 * `<ttl>60</ttl>` sets the throttle. Every item links back to its WWR page.
 * `<region>` is the eligibility signal; `<state>` is ignored (spike note).
 */
export class WeWorkRemotelyAdapter implements JobSource {
  readonly id: SourceId = 'we-work-remotely';
  readonly minIntervalMin = 60;

  constructor(
    private readonly url: string = WWR_URL,
    private readonly fetchFn: FetchFn = globalThis.fetch.bind(globalThis),
  ) {}

  async fetch(_since: Date | null): Promise<ListingDraft[]> {
    const res = await getBoard(this.fetchFn, this.url, 'We Work Remotely', 'application/rss+xml, application/xml');
    const xml = await res.text();
    if (XMLValidator.validate(xml) !== true) {
      throw new Error('We Work Remotely response is not valid XML');
    }
    const doc = parser.parse(xml) as unknown;
    const channel = isRecord(doc) && isRecord(doc.rss) ? doc.rss.channel : undefined;
    if (!isRecord(channel)) {
      throw new Error('We Work Remotely response has no RSS channel');
    }
    const items = channel.item ?? [];
    if (!Array.isArray(items)) {
      throw new Error('We Work Remotely channel items are not a list');
    }
    return items.flatMap((item) => {
      const draft = toDraft(item);
      return draft ? [draft] : [];
    });
  }
}

function toDraft(item: unknown): ListingDraft | null {
  if (!isRecord(item)) return null;
  const link = str(item.link);
  const sourceJobId = str(item.guid) || link;
  if (!sourceJobId || !link) return null;
  const { company, title } = splitWwrTitle(str(item.title));
  const region = str(item.region);
  const country = str(item.country);
  return {
    sourceJobId,
    url: link,
    title,
    company,
    descriptionHtml: typeof item.description === 'string' ? item.description : '',
    locationText: region === '' ? null : region,
    locationTags: country === '' ? [] : [country],
    postedAt: parseDate(item.pubDate),
  };
}
