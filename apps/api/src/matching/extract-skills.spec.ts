import { describe, expect, it } from 'vitest';
import { extractSkills } from './extract-skills.js';
import { loadMatchingRules } from './rules.js';

const skills = loadMatchingRules().skills;
const extract = (text: string) => extractSkills(text, skills);

describe('extractSkills', () => {
  it('maps synonyms to canonical ids in skills.json key order', () => {
    expect(extract('ReactJS and Nest.js')).toEqual(['react', 'nestjs']);
    expect(extract('Nest.js and ReactJS')).toEqual(['react', 'nestjs']);
  });

  it('matches whole words only', () => {
    expect(extract('reaction nesting')).toEqual([]);
  });

  it('returns each id once, case-insensitively', () => {
    expect(extract('React, react.js, REACT')).toEqual(['react']);
  });

  it('finds go only through golang, not the common word', () => {
    expect(extract('Ready to go? We use Golang.')).toEqual(['go']);
    expect(extract('Good to go')).toEqual([]);
  });

  it('maps the node synonyms', () => {
    expect(extract('Node.js')).toEqual(['node']);
    expect(extract('nodejs')).toEqual(['node']);
  });

  it('returns nothing for empty text', () => {
    expect(extract('')).toEqual([]);
    expect(extract('  ...  ')).toEqual([]);
  });

  it('uses the rules it is given', () => {
    expect(extractSkills('Elixir and React', { elixir: ['elixir'] })).toEqual(['elixir']);
  });

  it('ships the skills the plan requires', () => {
    for (const id of ['react', 'nestjs', 'typescript', 'javascript', 'node', 'python', 'java', 'go', 'aws', 'docker', 'kubernetes', 'postgres', 'mongodb', 'graphql', 'vue', 'angular', 'nextjs', 'tailwind']) {
      expect(skills[id], id).toBeDefined();
    }
    expect(skills.go).toEqual(['golang']);
    expect(skills.nestjs).toEqual(['nestjs', 'nest.js']);
  });

  it('does not read common English words as swift or rails', () => {
    expect(extractSkills('A swift hiring process with guard rails', skills)).toEqual([]);
    expect(extractSkills('Ruby on Rails and SwiftUI', skills)).toEqual(expect.arrayContaining(['rails', 'swift']));
  });
});
