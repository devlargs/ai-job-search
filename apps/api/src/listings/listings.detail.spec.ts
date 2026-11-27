import { HttpStatus, NotFoundException, type ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Types, type Model } from 'mongoose';
import { DEFAULT_PREFERENCE, ListingDetail } from '@ai-job-search/shared';
import { ErrorEnvelopeFilter } from '../common/error-envelope.filter.js';
import type { Listing } from '../ingestion/listing.schema.js';
import { ListingsReader, type StoredListing } from '../ingestion/listings-reader.js';
import { MatchingRules } from '../matching/matching.module.js';
import { loadMatchingRules } from '../matching/rules.js';
import type { PreferenceService } from '../preference/preference.service.js';
import type { ResumeSkills } from '../resume/resume-skills.js';
import { ListingsService } from './listings.service.js';

const ID = '6747a1b2c3d4e5f601234567';

function stored(overrides: Partial<StoredListing> = {}): StoredListing {
  return {
    _id: new Types.ObjectId(ID),
    source: 'remotive',
    sourceJobId: 'j1',
    url: 'https://remotive.com/remote-jobs/x-j1',
    title: 'Frontend Engineer',
    company: 'Acme',
    descriptionHtml: '<p>Build things.</p><ul><li>React</li></ul>',
    locationText: 'Worldwide',
    locationTags: [],
    postedAt: new Date('2026-11-25T08:00:00.000Z'),
    firstSeenAt: new Date('2026-11-26T09:30:00.000Z'),
    effectiveDate: new Date('2026-11-25T08:00:00.000Z'),
    lastSeenAt: new Date('2026-11-27T09:30:00.000Z'),
    eligibility: 'worldwide',
    skills: ['react'],
    rulesHash: 'h',
    ...overrides,
  };
}

const loaded = loadMatchingRules();
const rules = new MatchingRules(loaded.eligibility, loaded.skills, loaded.hash);
const noResume = { resumeSkillSet: async () => null } as ResumeSkills;
const pref = { get: vi.fn(async () => DEFAULT_PREFERENCE) } as unknown as PreferenceService;

/** A fake model whose findOne honours `_id` and the `$ne: 'restricted'` filter over `docs`. */
function serviceOver(docs: StoredListing[]) {
  const findOne = vi.fn((filter: { _id: Types.ObjectId; eligibility: { $ne: string } }) => {
    const hit = docs.find(
      (d) => d._id.toString() === filter._id.toString() && d.eligibility !== filter.eligibility.$ne,
    );
    const chain = { lean: () => chain, exec: async () => hit ?? null };
    return chain;
  });
  const model = { findOne } as unknown as Model<Listing>;
  return { service: new ListingsService(new ListingsReader(model), noResume, pref, rules), findOne };
}

async function notFound(p: Promise<unknown>) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(NotFoundException);
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) } as unknown as ArgumentsHost;
  new ErrorEnvelopeFilter().catch(err, host);
  expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
  expect(json).toHaveBeenCalledWith({ error: { code: 'not_found', message: 'Listing not found' } });
}

describe('listing detail read', () => {
  it('returns a stored listing as a ListingDetail with its description and ISO dates', async () => {
    const { service, findOne } = serviceOver([stored()]);

    const detail = await service.getDetail(ID);

    expect(findOne).toHaveBeenCalledWith(
      { _id: new Types.ObjectId(ID), eligibility: { $ne: 'restricted' } },
      { rulesHash: 0, skills: 0 },
    );
    expect(ListingDetail.safeParse(detail).success).toBe(true);
    expect(detail).toEqual({
      id: ID,
      source: 'remotive',
      title: 'Frontend Engineer',
      company: 'Acme',
      url: 'https://remotive.com/remote-jobs/x-j1',
      locationText: 'Worldwide',
      effectiveDate: '2026-11-25T08:00:00.000Z',
      eligibility: 'worldwide',
      descriptionHtml: '<p>Build things.</p><ul><li>React</li></ul>',
      postedAt: '2026-11-25T08:00:00.000Z',
      firstSeenAt: '2026-11-26T09:30:00.000Z',
    });
    expect(detail).not.toHaveProperty('score');
  });

  it('sanitizes the stored HTML again on read, dropping a script edited into the row', async () => {
    const { service } = serviceOver([stored({ descriptionHtml: '<p>Hi</p><script>x()</script>' })]);

    const detail = await service.getDetail(ID);

    expect(detail.descriptionHtml).toBe('<p>Hi</p>');
  });

  it('answers 404 not_found for a restricted listing', async () => {
    const { service } = serviceOver([stored({ eligibility: 'restricted' })]);
    await notFound(service.getDetail(ID));
  });

  it('answers 404 not_found for a valid ObjectId that is not stored', async () => {
    const { service } = serviceOver([stored()]);
    await notFound(service.getDetail('6747a1b2c3d4e5f6ffffffff'));
  });

  it.each(['abc', '', 'zzzzzzzzzzzzzzzzzzzzzzzz', '123456789012'])(
    'answers 404 not_found for the malformed id %j without querying',
    async (id) => {
      const { service, findOne } = serviceOver([stored()]);
      await notFound(service.getDetail(id));
      expect(findOne).not.toHaveBeenCalled();
    },
  );

  it('keeps postedAt null when the source gave no posted date', async () => {
    const { service } = serviceOver([stored({ postedAt: null })]);

    const detail = await service.getDetail(ID);

    expect(detail.postedAt).toBeNull();
    expect(detail.firstSeenAt).toBe('2026-11-26T09:30:00.000Z');
    expect(ListingDetail.safeParse(detail).success).toBe(true);
  });
});
