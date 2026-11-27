import { describe, expect, it } from 'vitest';
import { loadMatchingRules } from './rules.js';
import { tagEligibility, type EligibilityInput } from './tag-eligibility.js';

const rules = loadMatchingRules().eligibility;

function tag(input: Partial<EligibilityInput>) {
  return tagEligibility({ locationText: null, locationTags: [], text: '', ...input }, rules);
}

describe('tagEligibility', () => {
  it('tags a restricted phrase as restricted', () => {
    expect(tag({ locationText: 'US Only' })).toBe('restricted');
  });

  it.each(['Worldwide', 'Anywhere in the World'])('tags "%s" as worldwide', (locationText) => {
    expect(tag({ locationText })).toBe('worldwide');
  });

  it.each(['APAC', 'Asia'])('tags "%s" as apac', (locationText) => {
    expect(tag({ locationText })).toBe('apac');
  });

  it('tags the Philippines as ph-friendly', () => {
    expect(tag({ locationText: 'Philippines' })).toBe('ph-friendly');
  });

  it('tags a location naming only non-APAC places as restricted', () => {
    expect(tag({ locationText: 'USA, Canada' })).toBe('restricted');
    expect(tag({ locationTags: ['United States'] })).toBe('restricted');
    // the Remotive fixture's real strings
    expect(tag({ locationText: 'Americas, LATAM, Canada, USA timezones' })).toBe('restricted');
    expect(tag({ locationText: 'Europe, EMEA, Germany, European timezones' })).toBe('restricted');
  });

  it('tags a mixed list with an APAC place as apac', () => {
    expect(tag({ locationText: 'Europe, USA, Singapore' })).toBe('apac');
  });

  it('lets restricted win over a positive tag at the same level', () => {
    expect(tag({ locationText: 'Worldwide, US only' })).toBe('restricted');
  });

  it('returns unknown when nothing answers', () => {
    expect(tag({})).toBe('unknown');
    expect(tag({ locationText: 'Remote', text: 'A great team.' })).toBe('unknown');
  });

  it('falls to the source hint when there is no location', () => {
    expect(tag({ hint: 'ph-friendly' })).toBe('ph-friendly');
  });

  it('prefers the structured location over the hint', () => {
    expect(tag({ locationText: 'US Only', hint: 'ph-friendly' })).toBe('restricted');
  });

  it('prefers the hint over description phrases', () => {
    expect(tag({ hint: 'worldwide', text: 'You must be based in the United States.' })).toBe('worldwide');
  });

  it('falls to description phrases when there is no location or hint', () => {
    expect(tag({ text: 'Candidates must be based in the United States.' })).toBe('restricted');
    expect(tag({ text: 'Work from anywhere you like.' })).toBe('worldwide');
  });

  it('does not treat non-APAC places in the description as restricted', () => {
    expect(tag({ text: 'Our offices are in the USA and Canada.' })).toBe('unknown');
  });

  it('does not treat a place-neutral lead-in naming PH or APAC as restricted', () => {
    expect(tag({ text: 'Must be based in the Philippines' })).toBe('ph-friendly');
    expect(tag({ text: 'Only open to candidates in Asia' })).toBe('apac');
  });

  it('tags a structured "anywhere" scoped to a non-APAC place as restricted', () => {
    expect(tag({ locationText: 'Anywhere in the US' })).toBe('restricted');
  });

  it('ignores Ph.D. and single-word worldwide tokens in description text', () => {
    expect(tag({ text: 'Ph.D. preferred' })).toBe('unknown');
    expect(tag({ text: 'We are a global leader' })).toBe('unknown');
  });

  it('matches whole words only, case-insensitively', () => {
    expect(tag({ locationText: 'GLOBAL' })).toBe('worldwide');
    // "phone" and "asian" must not match "ph" or "asia"
    expect(tag({ text: 'Phone support for Asian-fusion restaurants' })).toBe('unknown');
  });
});
