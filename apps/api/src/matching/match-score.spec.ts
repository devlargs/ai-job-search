import { describe, expect, it } from 'vitest';
import { matchScore } from './match-score.js';

describe('matchScore', () => {
  it('rounds the share of job skills the resume covers', () => {
    expect(matchScore(['react', 'nestjs', 'aws'], new Set(['react', 'nestjs']))).toBe(67);
  });

  it('is 100 when the resume covers every job skill', () => {
    expect(matchScore(['react'], new Set(['react', 'vue']))).toBe(100);
  });

  it('is 0 with no overlap', () => {
    expect(matchScore(['go'], new Set(['react']))).toBe(0);
  });

  it('is null when the listing has no skills', () => {
    expect(matchScore([], new Set(['react']))).toBeNull();
  });

  it('is null when there is no resume', () => {
    expect(matchScore(['react'], null)).toBeNull();
  });
});
