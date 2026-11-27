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

/** The parsed rules plus the hash of every matching/data/*.json file (AD-3 rulesHash). */
export interface LoadedMatchingRules {
  eligibility: EligibilityRules;
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
  const raw: unknown = JSON.parse(readFileSync(join(dataDir, 'eligibility-rules.json'), 'utf8'));
  const eligibility = EligibilityRulesFile.parse(raw);
  return { eligibility, hash: computeRulesHash(dataDir) };
}
