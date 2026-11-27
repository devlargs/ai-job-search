import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { Listing } from './listing.schema.js';

export type StoredListing = Listing & { _id: { toString(): string } };
/** A feed row: a stored listing, `skills` included, without its (projected-out) description and rulesHash. */
export type FeedListing = Omit<StoredListing, 'descriptionHtml' | 'rulesHash'>;
/** A detail row: a stored listing without its (projected-out) rulesHash and skills. */
export type DetailListing = Omit<StoredListing, 'rulesHash' | 'skills'>;

const OBJECT_ID_HEX = /^[0-9a-f]{24}$/i;

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

  /** One non-restricted listing by id, or null when the id is malformed, unknown or restricted (R3, R8). */
  async findDetail(id: string): Promise<DetailListing | null> {
    if (!OBJECT_ID_HEX.test(id) || !Types.ObjectId.isValid(id)) return null;
    return this.listings
      .findOne({ _id: new Types.ObjectId(id), eligibility: { $ne: 'restricted' } }, { rulesHash: 0, skills: 0 })
      .lean<DetailListing>()
      .exec();
  }
}
