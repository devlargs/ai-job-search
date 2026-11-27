import { Module } from '@nestjs/common';
import { loadMatchingRules, type EligibilityRules, type LoadedMatchingRules } from './rules.js';

/** Injectable holder of the parsed rule files and their hash, loaded once at boot. */
export class MatchingRules implements LoadedMatchingRules {
  constructor(
    readonly eligibility: EligibilityRules,
    readonly hash: string,
  ) {}
}

@Module({
  providers: [
    {
      provide: MatchingRules,
      useFactory: (): MatchingRules => {
        const loaded = loadMatchingRules();
        return new MatchingRules(loaded.eligibility, loaded.hash);
      },
    },
  ],
  exports: [MatchingRules],
})
export class MatchingModule {}
