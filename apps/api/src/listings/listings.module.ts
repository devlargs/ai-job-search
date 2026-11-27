import { Module } from '@nestjs/common';
import { IngestionModule } from '../ingestion/ingestion.module.js';
import { MatchingModule } from '../matching/matching.module.js';
import { PreferenceModule } from '../preference/preference.module.js';
import { ResumeModule } from '../resume/resume.module.js';
import { ListingsController } from './listings.controller.js';
import { ListingsService } from './listings.service.js';

@Module({
  imports: [IngestionModule, ResumeModule, PreferenceModule, MatchingModule],
  controllers: [ListingsController],
  providers: [ListingsService],
})
export class ListingsModule {}
