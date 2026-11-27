import { Controller, Get, Param } from '@nestjs/common';
import type { FeedResponse, ListingDetail } from '@ai-job-search/shared';
import { ListingsService } from './listings.service.js';

@Controller()
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  /** GET /api/feed: stored listings grouped into freshness tiers. Never waits on a fetch. */
  @Get('feed')
  getFeed(): Promise<FeedResponse> {
    return this.listings.getFeed();
  }

  /** GET /api/listings/:id: one non-restricted listing with its sanitized description; 404 otherwise. */
  @Get('listings/:id')
  getDetail(@Param('id') id: string): Promise<ListingDetail> {
    return this.listings.getDetail(id);
  }
}
