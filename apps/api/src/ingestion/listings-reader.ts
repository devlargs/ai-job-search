import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Listing } from './listing.schema.js';

export type StoredListing = Listing & { _id: { toString(): string } };
/** A feed row: a stored listing without its (projected-out) description. */
export type FeedListing = Omit<StoredListing, 'descriptionHtml'>;

/** Read-only access to `listings` for every module other than ingestion (AD-3). */
@Injectable()
export class ListingsReader {
  constructor(@InjectModel(Listing.name) private readonly listings: Model<Listing>) {}

  /** All stored listings, newest effectiveDate first. */
  async findFeed(): Promise<FeedListing[]> {
    return this.listings
      .find({}, { descriptionHtml: 0 })
      .sort({ effectiveDate: -1, _id: -1 })
      .lean<FeedListing[]>()
      .exec();
  }
}
