import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ListingDraft } from '@ai-job-search/shared';
import { htmlToText } from '../ingestion/sanitize-html.js';
import { HimalayasAdapter } from '../sources/adapters/himalayas.adapter.js';
import { JobicyAdapter } from '../sources/adapters/jobicy.adapter.js';
import { RemoteOkAdapter } from '../sources/adapters/remoteok.adapter.js';
import { WeWorkRemotelyAdapter } from '../sources/adapters/we-work-remotely.adapter.js';
import type { JobSource } from '../sources/job-source.port.js';
import { loadMatchingRules } from './rules.js';
import { tagEligibility } from './tag-eligibility.js';

const rules = loadMatchingRules().eligibility;

function fixture(name: string): string {
  return readFileSync(new URL(`../sources/adapters/__fixtures__/${name}`, import.meta.url), 'utf8');
}

/** A fetch that always serves `body`; Himalayas' cursor is cleared so it reads one page. */
function fakeFetch(body: string): typeof fetch {
  return (async () => new Response(body, { status: 200 })) as unknown as typeof fetch;
}

const himalayasOnePage = JSON.stringify({ ...JSON.parse(fixture('himalayas.json')), nextCursor: null });

const boards: Array<[string, JobSource]> = [
  ['remoteok', new RemoteOkAdapter(undefined, fakeFetch(fixture('remoteok.json')))],
  ['we-work-remotely', new WeWorkRemotelyAdapter(undefined, fakeFetch(fixture('we-work-remotely.xml')))],
  ['himalayas', new HimalayasAdapter(undefined, fakeFetch(himalayasOnePage))],
  ['jobicy', new JobicyAdapter(undefined, fakeFetch(fixture('jobicy.json')))],
];

function tag(source: JobSource, draft: ListingDraft) {
  return tagEligibility(
    {
      locationText: draft.locationText,
      locationTags: draft.locationTags,
      text: `${draft.title} ${htmlToText(draft.descriptionHtml)}`,
      hint: source.eligibilityHint,
    },
    rules,
  );
}

async function tagsFor(source: JobSource) {
  const drafts = await source.fetch(null);
  return drafts.map((draft) => tag(source, draft));
}

describe('board fixtures through tagEligibility', () => {
  it.each(boards)('%s has at least one non-restricted listing', async (_id, source) => {
    const tags = await tagsFor(source);
    expect(tags.length).toBe(4);
    expect(tags.some((t) => t !== 'restricted')).toBe(true);
  });

  it('tags the Remote OK location formats', async () => {
    // "Worldwide", "Asia", "US Only", ""
    expect(await tagsFor(boards[0]![1])).toEqual(['worldwide', 'apac', 'restricted', 'unknown']);
  });

  it('tags the We Work Remotely regions', async () => {
    // "Anywhere in the World" (with a state, ignored), "Asia Only", "USA Only" x2
    expect(await tagsFor(boards[1]![1])).toEqual(['worldwide', 'apac', 'restricted', 'restricted']);
  });

  it('tags the Himalayas location restrictions', async () => {
    // [Colombia, ..., Philippines], [United States], Europe-wide list, [Australia]
    expect(await tagsFor(boards[2]![1])).toEqual(['ph-friendly', 'restricted', 'restricted', 'apac']);
  });

  it('tags the Jobicy geo lists', async () => {
    // "USA", "Poland,  UK,  USA", "Australia,  New Zealand", "Philippines"
    expect(await tagsFor(boards[3]![1])).toEqual(['restricted', 'restricted', 'apac', 'ph-friendly']);
  });

  it('tags single European and Latin American country lists as restricted', () => {
    for (const country of ['Albania', 'Croatia', 'Norway', 'Honduras', 'Uruguay', 'Armenia']) {
      expect(tagEligibility({ locationText: null, locationTags: [country], text: '' }, rules)).toBe('restricted');
    }
  });
});
