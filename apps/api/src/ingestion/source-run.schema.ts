import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

/** One record per source per run (AD-3). */
@Schema({ collection: 'source_runs', versionKey: false })
export class SourceRun {
  @Prop({ type: String, required: true })
  source!: string;

  @Prop({ type: Date, required: true })
  startedAt!: Date;

  @Prop({ type: Date, required: true })
  finishedAt!: Date;

  @Prop({ type: Boolean, required: true })
  ok!: boolean;

  @Prop({ type: Number, default: 0 })
  count!: number;

  @Prop({ type: String, default: null })
  error!: string | null;
}

export type SourceRunDocument = HydratedDocument<SourceRun>;

export const SourceRunSchema = SchemaFactory.createForClass(SourceRun);
SourceRunSchema.index({ source: 1, ok: 1, startedAt: -1 });
