import { HttpStatus, Logger, type ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Model } from 'mongoose';
import { DEFAULT_PREFERENCE, FeedResponse, type Preference } from '@ai-job-search/shared';
import { ErrorEnvelopeFilter } from '../common/error-envelope.filter.js';
import type { Listing } from '../ingestion/listing.schema.js';
import { ListingsReader, type StoredListing } from '../ingestion/listings-reader.js';
import { MatchingRules } from '../matching/matching.module.js';
import { loadMatchingRules } from '../matching/rules.js';
import type { PreferenceService } from '../preference/preference.service.js';
import type { ResumeSkills } from '../resume/resume-skills.js';
import { ListingsService } from './listings.service.js';

function stored(
  id: string,
  effectiveDate: string,
  eligibility: StoredListing['eligibility'] = 'worldwide',
  skills: string[] = [],
  title = `Job ${id}`,
): StoredListing {
  return {
    _id: { toString: () => id },
    source: 'remotive',
    sourceJobId: id,
    url: `https://remotive.com/remote-jobs/x-${id}`,
    title,
    company: 'Acme',
    descriptionHtml: '',
    locationText: null,
    locationTags: [],
    postedAt: null,
    firstSeenAt: new Date(effectiveDate),
    effectiveDate: new Date(effectiveDate),
    lastSeenAt: new Date(effectiveDate),
    eligibility,
    skills,
    rulesHash: 'h',
  };
}

const NOW = new Date('2026-11-27T12:00:00.000Z');

const noResume = { resumeSkillSet: async () => null } as ResumeSkills;

const loaded = loadMatchingRules();
const rules = new MatchingRules(loaded.eligibility, loaded.skills, loaded.hash);

const prefOf = (p: Preference) => ({ get: vi.fn(async () => p) }) as unknown as PreferenceService;

function serviceOver(
  docs: StoredListing[],
  resume: ResumeSkills = noResume,
  preference: PreferenceService = prefOf(DEFAULT_PREFERENCE),
) {
  const sort = vi.fn();
  const chain = { sort, lean: () => chain, exec: async () => docs };
  sort.mockReturnValue(chain);
  const find = vi.fn(() => chain);
  const model = { find } as unknown as Model<Listing>;
  return { service: new ListingsService(new ListingsReader(model), resume, preference, rules), find, sort };
}

const allItems = (feed: FeedResponse) => [...feed.tiers.fresh, ...feed.tiers.recent, ...feed.tiers.older];

describe('feed read', () => {
  it('groups listings into freshness tiers with resumeStatus none and ISO dates', async () => {
    const { service, sort } = serviceOver([
      stored('fresh', '2026-11-27T10:00:00.000Z'), // now − 2h
      stored('recent', '2026-11-26T06:00:00.000Z'), // now − 30h
      stored('older', '2026-11-22T12:00:00.000Z'), // now − 5d
    ]);

    const feed = await service.getFeed(NOW);

    expect(sort).toHaveBeenCalledWith({ effectiveDate: -1, _id: -1 });
    expect(FeedResponse.safeParse(feed).success).toBe(true);
    expect(feed.resumeStatus).toBe('none');
    expect(feed.tiers.fresh.map((i) => i.id)).toEqual(['fresh']);
    expect(feed.tiers.recent.map((i) => i.id)).toEqual(['recent']);
    expect(feed.tiers.older.map((i) => i.id)).toEqual(['older']);
    expect(feed.tiers.fresh[0]!.effectiveDate).toBe('2026-11-27T10:00:00.000Z');
  });

  it('returns three empty tiers for an empty database', async () => {
    const feed = await serviceOver([]).service.getFeed(NOW);

    expect(feed).toEqual({ resumeStatus: 'none', tiers: { fresh: [], recent: [], older: [] } });
  });

  it('excludes restricted listings in the query and carries each item\'s eligibility', async () => {
    const legacy = { ...stored('d', '2026-11-23T00:00:00.000Z'), eligibility: undefined } as unknown as StoredListing;
    const docs = [
      stored('a', '2026-11-26T00:00:00.000Z', 'worldwide'),
      stored('b', '2026-11-25T00:00:00.000Z', 'apac'),
      stored('c', '2026-11-24T00:00:00.000Z', 'ph-friendly'),
      stored('e', '2026-11-22T00:00:00.000Z', 'unknown'),
      legacy,
    ];
    const { service, find } = serviceOver(docs);

    const feed = await service.getFeed(NOW);

    expect(find).toHaveBeenCalledWith({ eligibility: { $ne: 'restricted' } }, expect.objectContaining({ descriptionHtml: 0 }));
    expect(FeedResponse.safeParse(feed).success).toBe(true);
    expect(allItems(feed).map((i) => i.eligibility)).toEqual(['worldwide', 'apac', 'ph-friendly', 'unknown', 'unknown']);
  });

  it('gives every item a null score and hides nothing when there is no resume', async () => {
    const docs = [
      stored('a', '2026-11-27T10:00:00.000Z', 'worldwide', ['react', 'nestjs']),
      stored('b', '2026-11-26T06:00:00.000Z', 'apac', ['go']),
      stored('c', '2026-11-22T12:00:00.000Z', 'unknown'),
      { ...stored('legacy', '2026-11-21T12:00:00.000Z'), skills: undefined } as unknown as StoredListing,
    ];

    const feed = await serviceOver(docs).service.getFeed(NOW);

    expect(FeedResponse.safeParse(feed).success).toBe(true);
    expect(allItems(feed)).toHaveLength(docs.length);
    expect(allItems(feed).every((i) => i.score === null)).toBe(true);
  });

  it('drops scored items below minMatch, keeps unscored ones, and orders by score', async () => {
    expect(DEFAULT_PREFERENCE.minMatch).toBe(40);
    // 4 of 5 skills -> 80; 7 of 18 -> 39; no skills -> null.
    const many = Array.from({ length: 18 }, (_, i) => `s${i}`);
    const resume = { resumeSkillSet: async () => new Set(['s0', 's1', 's2', 's3', 's4', 's5', 's6']) } as ResumeSkills;
    const docs = [
      stored('null', '2026-11-27T11:00:00.000Z', 'worldwide', []),
      stored('39', '2026-11-27T10:30:00.000Z', 'worldwide', many),
      stored('80', '2026-11-27T10:00:00.000Z', 'worldwide', ['s0', 's1', 's2', 's3', 'zz']),
    ];

    const feed = await serviceOver(docs, resume).service.getFeed(NOW);

    expect(FeedResponse.safeParse(feed).success).toBe(true);
    expect(feed.tiers.fresh.map((i) => [i.id, i.score])).toEqual([
      ['80', 80],
      ['null', null],
    ]);
  });

  it('keeps only listings whose title or skills match a keyword', async () => {
    const docs = [
      stored('a', '2026-11-27T10:00:00.000Z', 'worldwide', ['vue'], 'Senior Frontend Engineer'),
      stored('b', '2026-11-27T09:00:00.000Z', 'worldwide', ['react'], 'UI Engineer'),
      stored('c', '2026-11-27T08:00:00.000Z', 'worldwide', ['go'], 'Backend Dev'),
      stored('d', '2026-11-27T07:00:00.000Z', 'worldwide', ['javascript'], 'JavaScript Developer'),
      { ...stored('legacy', '2026-11-27T06:00:00.000Z', 'worldwide', [], 'Platform Engineer'), skills: undefined } as unknown as StoredListing,
    ];
    const pref = prefOf({ roleKeywords: ['Frontend', 'React'], minMatch: 40 });

    const feed = await serviceOver(docs, noResume, pref).service.getFeed(NOW);

    expect(FeedResponse.safeParse(feed).success).toBe(true);
    expect(allItems(feed).map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('does not let a Java keyword match a JavaScript listing', async () => {
    const docs = [stored('d', '2026-11-27T07:00:00.000Z', 'worldwide', ['javascript'], 'JavaScript Developer')];
    const feed = await serviceOver(docs, noResume, prefOf({ roleKeywords: ['Java'], minMatch: 40 })).service.getFeed(NOW);
    expect(allItems(feed)).toEqual([]);
  });

  it('passes every listing with empty keywords', async () => {
    const docs = [
      stored('a', '2026-11-27T10:00:00.000Z', 'worldwide', [], 'Frontend'),
      stored('b', '2026-11-27T09:00:00.000Z', 'worldwide', [], 'Backend'),
    ];
    const feed = await serviceOver(docs, noResume, prefOf({ roleKeywords: [], minMatch: 40 })).service.getFeed(NOW);
    expect(allItems(feed)).toHaveLength(2);
  });

  it("uses the preference's minMatch: 80 and null kept, 60 dropped at 70", async () => {
    const resume = { resumeSkillSet: async () => new Set(['s0', 's1', 's2', 's3', 's4', 's5']) } as ResumeSkills;
    const docs = [
      stored('80', '2026-11-27T10:00:00.000Z', 'worldwide', ['s0', 's1', 's2', 's3', 'zz']),
      stored('60', '2026-11-27T09:00:00.000Z', 'worldwide', ['s0', 's1', 's2', 'y1', 'y2']),
      stored('null', '2026-11-27T08:00:00.000Z', 'worldwide', []),
    ];

    const at70 = await serviceOver(docs, resume, prefOf({ roleKeywords: [], minMatch: 70 })).service.getFeed(NOW);
    const at40 = await serviceOver(docs, resume, prefOf({ roleKeywords: [], minMatch: 40 })).service.getFeed(NOW);

    expect(at70.tiers.fresh.map((i) => [i.id, i.score])).toEqual([
      ['80', 80],
      ['null', null],
    ]);
    expect(at40.tiers.fresh.map((i) => i.id)).toEqual(['80', '60', 'null']);
  });

  it('falls back to the defaults and warns when the preference read fails', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const failing = { get: vi.fn(async () => { throw new Error('connection refused'); }) } as unknown as PreferenceService;
    const docs = [
      stored('a', '2026-11-27T10:00:00.000Z', 'worldwide', [], 'Frontend'),
      stored('b', '2026-11-27T09:00:00.000Z', 'worldwide', [], 'Backend'),
    ];

    const feed = await serviceOver(docs, noResume, failing).service.getFeed(NOW);

    expect(FeedResponse.safeParse(feed).success).toBe(true);
    expect(allItems(feed)).toHaveLength(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('connection refused'));
    warn.mockRestore();
  });

  it('turns a database error into a 500 error envelope', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) } as unknown as ArgumentsHost;

    new ErrorEnvelopeFilter().catch(new Error('connection refused'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({ error: { code: 'internal_error', message: 'Internal server error' } });
  });
});
