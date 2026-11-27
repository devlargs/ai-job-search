import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

/** Owned by ingestion, its only writer (AD-3). Other modules read via ListingsReader. */
@Schema({ collection: 'listings', versionKey: false })
export class Listing {
  @Prop({ type: String, required: true })
  source!: string;

  @Prop({ type: String, required: true })
  sourceJobId!: string;

  @Prop({ type: String, required: true })
  url!: string;

  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String, default: '' })
  company!: string;

  @Prop({ type: String, default: '' })
  descriptionHtml!: string;

  @Prop({ type: String, default: null })
  locationText!: string | null;

  @Prop({ type: [String], default: [] })
  locationTags!: string[];

  @Prop({ type: Date, default: null })
  postedAt!: Date | null;

  @Prop({ type: Date, required: true })
  firstSeenAt!: Date;

  @Prop({ type: Date, required: true })
  effectiveDate!: Date;

  @Prop({ type: Date, required: true })
  lastSeenAt!: Date;
}

export type ListingDocument = HydratedDocument<Listing>;

export const ListingSchema = SchemaFactory.createForClass(Listing);
ListingSchema.index({ source: 1, sourceJobId: 1 }, { unique: true });
ListingSchema.index({ effectiveDate: -1 });
