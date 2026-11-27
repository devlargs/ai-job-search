import type { Eligibility } from '@ai-job-search/shared';
import type { EligibilityRules } from './rules.js';

export interface EligibilityInput {
  locationText: string | null;
  locationTags: string[];
  /** The description as plain text. */
  text: string;
  /** The source's known default (JobSource.eligibilityHint). */
  hint?: Eligibility | null;
}

/** Lowercases and turns every run of non-letters/digits into one space, padded, for whole-word matching. */
function normalize(value: string): string {
  return ` ${value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
}

function mentions(haystack: string, phrases: string[]): boolean {
  return phrases.some((phrase) => {
    const needle = normalize(phrase);
    return needle.trim() !== '' && haystack.includes(needle);
  });
}

/**
 * One level of the precedence. Place-specific restricted phrases ("us only")
 * beat every positive tag. A place-neutral lead-in ("must be based in") is
 * restricted unless the text names a PH or APAC term. Then PH, then APAC.
 * At the structured level, naming a non-APAC place is restricted before the
 * worldwide check ("Anywhere in the US"). In description text, only multi-word
 * worldwide tokens count, so boilerplate like "a global leader" stays unknown.
 */
function tagLevel(value: string, rules: EligibilityRules, structured: boolean): Eligibility | null {
  const haystack = normalize(value);
  if (haystack.trim() === '') return null;
  if (mentions(haystack, rules.restrictedPhrases)) return 'restricted';
  const ph = mentions(haystack, rules.phFriendly);
  const apac = mentions(haystack, rules.apac);
  if (!ph && !apac && mentions(haystack, rules.restrictedLeadIns)) return 'restricted';
  if (ph) return 'ph-friendly';
  if (apac) return 'apac';
  if (structured && mentions(haystack, rules.otherPlaces)) return 'restricted';
  const worldwide = structured ? rules.worldwide : rules.worldwide.filter((token) => token.trim().includes(' '));
  if (mentions(haystack, worldwide)) return 'worldwide';
  return null;
}

/**
 * AD-4 eligibility tag. Pure. Precedence, most reliable first: structured
 * location (locationText + locationTags), then the source hint, then phrases
 * in the description. The first level that answers wins; otherwise `unknown`.
 */
export function tagEligibility(input: EligibilityInput, rules: EligibilityRules): Eligibility {
  const structured = [input.locationText ?? '', ...input.locationTags].join(' , ');
  const fromLocation = tagLevel(structured, rules, true);
  if (fromLocation) return fromLocation;
  if (input.hint && input.hint !== 'unknown') return input.hint;
  return tagLevel(input.text, rules, false) ?? 'unknown';
}
