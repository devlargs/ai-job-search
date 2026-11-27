import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** matching/data, resolved from this file so it works from src (vitest) and dist (nest build copies the assets). */
export const MATCHING_DATA_DIR = fileURLToPath(new URL('./data/', import.meta.url));

const PhraseList = z.array(z.string().trim().min(1));

/** Shape of matching/data/eligibility-rules.json (AD-4). Data, not code. */
export const EligibilityRulesFile = z.object({
  restrictedPhrases: PhraseList,
  /** Place-neutral lead-ins ("must be based in"): restricted only when the same text names no PH or APAC term. */
  restrictedLeadIns: PhraseList,
  worldwide: PhraseList,
  phFriendly: PhraseList,
  apac: PhraseList,
  otherPlaces: PhraseList,
});
export type EligibilityRules = z.infer<typeof EligibilityRulesFile>;

/** Shape of matching/data/skills.json (AD-4): canonical SkillId (lowercase kebab) -> synonyms. Key order is extractSkills' output order. */
export const SkillsFile = z.record(
  z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'skill ids are lowercase kebab'),
  z.array(z.string().trim().refine((s) => /[\p{L}\p{N}]/u.test(s), 'a synonym needs a letter or digit')).min(1),
);
export type SkillRules = z.infer<typeof SkillsFile>;

/** The parsed rules plus the hash of every matching/data/*.json file (AD-3 rulesHash). */
export interface LoadedMatchingRules {
  eligibility: EligibilityRules;
  skills: SkillRules;
  hash: string;
}

/** sha256 over the sorted data/*.json filenames and contents. Any edit, add or rename changes it. */
export function computeRulesHash(dataDir: string = MATCHING_DATA_DIR): string {
  const hash = createHash('sha256');
  const files = readdirSync(dataDir)
    .filter((name) => name.endsWith('.json'))
    .sort();
  for (const name of files) {
    hash.update(name);
    hash.update('\0');
    hash.update(readFileSync(join(dataDir, name)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

/** Reads and validates the rule files. Throws when a file is missing or malformed, so boot fails loudly. */
export function loadMatchingRules(dataDir: string = MATCHING_DATA_DIR): LoadedMatchingRules {
  const eligibility = EligibilityRulesFile.parse(readJson(dataDir, 'eligibility-rules.json'));
  const skills = SkillsFile.parse(readJson(dataDir, 'skills.json'));
  return { eligibility, skills, hash: computeRulesHash(dataDir) };
}

function readJson(dataDir: string, name: string): unknown {
  return JSON.parse(readFileSync(join(dataDir, name), 'utf8'));
}
