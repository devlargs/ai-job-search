import { Module } from '@nestjs/common';
import { IngestionModule } from '../ingestion/ingestion.module.js';
import { ListingsController } from './listings.controller.js';
import { ListingsService } from './listings.service.js';

@Module({
  imports: [IngestionModule],
  controllers: [ListingsController],
  providers: [ListingsService],
})
export class ListingsModule {}
