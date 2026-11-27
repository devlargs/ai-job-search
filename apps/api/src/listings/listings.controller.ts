import { Controller, Get } from '@nestjs/common';
import type { FeedResponse } from '@ai-job-search/shared';
import { ListingsService } from './listings.service.js';

@Controller()
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  /** GET /api/feed: stored listings, newest effectiveDate first. Never waits on a fetch. */
  @Get('feed')
  getFeed(): Promise<FeedResponse> {
    return this.listings.getFeed();
  }
}
