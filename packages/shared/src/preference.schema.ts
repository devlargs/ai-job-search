import { z } from 'zod';

/** Keeps the first spelling of each keyword, dropping later case-insensitive repeats. */
function dedupeCaseInsensitive(keywords: string[]): string[] {
  const seen = new Set<string>();
  return keywords.filter((keyword) => {
    const key = keyword.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The one active preference (AD-9). A listing passes when any keyword matches;
 * an empty list passes everything. Scored listings below `minMatch` are hidden (R5).
 */
export const Preference = z.object({
  roleKeywords: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(40)
        .refine((k) => /[\p{L}\p{N}]/u.test(k), 'a keyword needs a letter or digit'),
    )
    .max(20)
    .transform(dedupeCaseInsensitive),
  minMatch: z.number().int().min(0).max(100),
});
export type Preference = z.output<typeof Preference>;

export const DEFAULT_PREFERENCE: Preference = { roleKeywords: [], minMatch: 40 };
