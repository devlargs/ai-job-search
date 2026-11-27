import type { SkillId } from './extract-skills.js';
import type { SkillRules } from './rules.js';
import { mentions, normalize } from './text-match.js';

/**
 * The `SkillId` a preference keyword names, or null. A keyword resolves when its
 * normalized form equals one of a skill's normalized synonyms ("ReactJS" and
 * "React" both give `react`). Pure.
 */
export function resolveKeyword(keyword: string, skills: SkillRules): SkillId | null {
  const needle = normalize(keyword);
  if (needle.trim() === '') return null;
  for (const [id, synonyms] of Object.entries(skills)) {
    if (synonyms.some((synonym) => normalize(synonym) === needle)) return id;
  }
  return null;
}

/**
 * AD-9 pass rule. Pure. True when `roleKeywords` is empty or any keyword matches:
 * a keyword that resolves to a skill matches the listing's `skills`; any other
 * keyword matches the title as whole words, case-insensitively.
 */
export function passesPreference(
  listing: { title: string; skills?: readonly SkillId[] | null },
  roleKeywords: readonly string[],
  skills: SkillRules,
): boolean {
  if (roleKeywords.length === 0) return true;
  const listingSkills = new Set(listing.skills ?? []);
  const title = normalize(listing.title);
  return roleKeywords.some((keyword) => {
    const skill = resolveKeyword(keyword, skills);
    return skill !== null ? listingSkills.has(skill) : mentions(title, [keyword]);
  });
}
