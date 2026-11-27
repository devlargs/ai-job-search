import type { SkillId } from './extract-skills.js';

/**
 * AD-4 match score. Pure. `null` when the listing has no skills or there is no
 * confirmed resume; otherwise round(100 × |jobSkills ∩ resumeSkillSet| / |jobSkills|).
 * Computed at feed read, never stored.
 */
export function matchScore(jobSkills: readonly SkillId[], resumeSkillSet: ReadonlySet<SkillId> | null): number | null {
  if (resumeSkillSet === null) return null;
  const unique = new Set(jobSkills);
  if (unique.size === 0) return null;
  let overlap = 0;
  for (const skill of unique) if (resumeSkillSet.has(skill)) overlap++;
  return Math.round((100 * overlap) / unique.size);
}
