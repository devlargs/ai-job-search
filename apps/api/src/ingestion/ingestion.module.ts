import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SourcesModule } from '../sources/sources.module.js';
import { IngestionScheduler } from './ingestion.scheduler.js';
import { IngestionService } from './ingestion.service.js';
import { Listing, ListingSchema } from './listing.schema.js';
import { ListingsReader } from './listings-reader.js';
import { SourceRun, SourceRunSchema } from './source-run.schema.js';

@Module({
  imports: [
    SourcesModule,
    MongooseModule.forFeature([
      { name: Listing.name, schema: ListingSchema },
      { name: SourceRun.name, schema: SourceRunSchema },
    ]),
  ],
  providers: [IngestionService, IngestionScheduler, ListingsReader],
  exports: [ListingsReader],
})
export class IngestionModule {}
