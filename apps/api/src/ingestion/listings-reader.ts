import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Listing } from './listing.schema.js';

export type StoredListing = Listing & { _id: { toString(): string } };
/** A feed row: a stored listing, `skills` included, without its (projected-out) description and rulesHash. */
export type FeedListing = Omit<StoredListing, 'descriptionHtml' | 'rulesHash'>;

/** Read-only access to `listings` for every module other than ingestion (AD-3). */
@Injectable()
export class ListingsReader {
  constructor(@InjectModel(Listing.name) private readonly listings: Model<Listing>) {}

  /** Stored listings that are not restricted (AD-4 step 1), newest effectiveDate first. */
  async findFeed(): Promise<FeedListing[]> {
    return this.listings
      .find({ eligibility: { $ne: 'restricted' } }, { descriptionHtml: 0, rulesHash: 0 })
      .sort({ effectiveDate: -1, _id: -1 })
      .lean<FeedListing[]>()
      .exec();
  }
}
