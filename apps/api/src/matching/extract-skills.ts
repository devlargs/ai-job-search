import type { SkillRules } from './rules.js';
import { mentions, normalize } from './text-match.js';

/** A canonical skill id: a key of matching/data/skills.json (lowercase kebab, e.g. `react`). */
export type SkillId = string;

/**
 * AD-4 skill extraction. Pure. Returns the unique `SkillId`s any of whose
 * synonyms appears in `text` as whole words, case-insensitively, in
 * skills.json key order. Only the synonyms are matched, not the key itself, so
 * `go` can be found through `golang` alone. A listing's text is its title plus
 * its sanitized description as plain text.
 */
export function extractSkills(text: string, skills: SkillRules): SkillId[] {
  const haystack = normalize(text);
  if (haystack.trim() === '') return [];
  return Object.entries(skills)
    .filter(([, synonyms]) => mentions(haystack, synonyms))
    .map(([id]) => id);
}
