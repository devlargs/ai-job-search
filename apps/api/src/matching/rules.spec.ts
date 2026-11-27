import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { computeRulesHash, loadMatchingRules, MATCHING_DATA_DIR } from './rules.js';

const dirs: string[] = [];
function copyOfData(): string {
  const dir = mkdtempSync(join(tmpdir(), 'matching-data-'));
  cpSync(MATCHING_DATA_DIR, dir, { recursive: true });
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('matching rules', () => {
  it('loads and validates the shipped rules file', () => {
    const loaded = loadMatchingRules();
    expect(loaded.eligibility.restrictedPhrases).toContain('us only');
    expect(loaded.skills.react).toEqual(['react', 'reactjs', 'react.js']);
    expect(loaded.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('includes skills.json in the hash', () => {
    const dir = copyOfData();
    const file = join(dir, 'skills.json');
    const skills = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string[]>;
    skills.elixir = ['elixir'];
    writeFileSync(file, JSON.stringify(skills));
    expect(computeRulesHash(dir)).not.toBe(computeRulesHash(MATCHING_DATA_DIR));
  });

  it('gives the same hash for the same content', () => {
    expect(computeRulesHash(copyOfData())).toBe(computeRulesHash(MATCHING_DATA_DIR));
  });

  it('changes the hash when the rules content changes', () => {
    const dir = copyOfData();
    const file = join(dir, 'eligibility-rules.json');
    const rules = JSON.parse(readFileSync(file, 'utf8')) as { restrictedPhrases: string[] };
    rules.restrictedPhrases.push('latam residents only');
    writeFileSync(file, JSON.stringify(rules));
    expect(computeRulesHash(dir)).not.toBe(computeRulesHash(MATCHING_DATA_DIR));
  });

  it('changes the hash when another data file is added', () => {
    const dir = copyOfData();
    writeFileSync(join(dir, 'extra.json'), '{}');
    expect(computeRulesHash(dir)).not.toBe(computeRulesHash(MATCHING_DATA_DIR));
  });

  it.each([
    ['an empty synonym list', { react: [] }],
    ['a non-kebab id', { React: ['react'] }],
    ['a synonym with no letters or digits', { csharp: ['#'] }],
  ])('rejects a skills file with %s', (_label, skills) => {
    const dir = copyOfData();
    writeFileSync(join(dir, 'skills.json'), JSON.stringify(skills));
    expect(() => loadMatchingRules(dir)).toThrow();
  });

  it('rejects a malformed rules file', () => {
    const dir = copyOfData();
    writeFileSync(join(dir, 'eligibility-rules.json'), JSON.stringify({ worldwide: ['x'] }));
    expect(() => loadMatchingRules(dir)).toThrow();
  });
});
