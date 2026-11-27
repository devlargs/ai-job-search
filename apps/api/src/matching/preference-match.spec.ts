import { describe, expect, it } from 'vitest';
import { passesPreference, resolveKeyword } from './preference-match.js';
import { loadMatchingRules } from './rules.js';

const skills = loadMatchingRules().skills;
const passes = (title: string, listingSkills: string[], keywords: string[]) =>
  passesPreference({ title, skills: listingSkills }, keywords, skills);

describe('resolveKeyword', () => {
  it('resolves synonyms to their skill, case-insensitively', () => {
    expect(resolveKeyword('ReactJS', skills)).toBe('react');
    expect(resolveKeyword('React', skills)).toBe('react');
    expect(resolveKeyword(' Node.js ', skills)).toBe('node');
    expect(resolveKeyword('Java', skills)).toBe('java');
  });

  it('returns null for a keyword that is no synonym', () => {
    expect(resolveKeyword('Frontend', skills)).toBeNull();
    expect(resolveKeyword('React Developer', skills)).toBeNull();
    expect(resolveKeyword('...', skills)).toBeNull();
  });
});

describe('passesPreference', () => {
  it('matches a title keyword on whole words', () => {
    expect(passes('Senior Frontend Engineer', [], ['Frontend'])).toBe(true);
    expect(passes('Backend Dev', [], ['Frontend'])).toBe(false);
    expect(passes('senior FRONTEND engineer', [], ['frontend'])).toBe(true);
  });

  it('matches a skill keyword against the listing skills, not the title', () => {
    expect(passes('UI Engineer', ['react'], ['ReactJS'])).toBe(true);
    expect(passes('React Engineer', [], ['ReactJS'])).toBe(false);
  });

  it('passes when either keyword matches', () => {
    const kw = ['Frontend', 'React'];
    expect(passes('Frontend Developer', ['vue'], kw)).toBe(true);
    expect(passes('UI Engineer', ['react'], kw)).toBe(true);
    expect(passes('Backend Engineer', ['go'], kw)).toBe(false);
  });

  it('does not let Java match JavaScript', () => {
    expect(passes('JavaScript Developer', ['javascript'], ['Java'])).toBe(false);
  });

  it('passes everything with no keywords', () => {
    expect(passes('Anything', [], [])).toBe(true);
  });

  it('treats missing skills as none', () => {
    expect(passesPreference({ title: 'Dev', skills: undefined }, ['React'], skills)).toBe(false);
  });
});
