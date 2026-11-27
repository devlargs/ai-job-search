/** Lowercases and turns every run of non-letters/digits into one space, padded, for whole-word matching. */
export function normalize(value: string): string {
  return ` ${value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
}

/** True when the normalized `haystack` contains any of `phrases` as whole words. */
export function mentions(haystack: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => {
    const needle = normalize(phrase);
    return needle.trim() !== '' && haystack.includes(needle);
  });
}
