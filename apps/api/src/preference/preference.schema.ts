import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** The fixed `_id` of the single preference document (AD-9). */
export const ACTIVE_PREFERENCE_ID = 'active';

/** The one active preference (AD-9), stored in the `preference` collection under `_id: 'active'`. */
@Schema({ collection: 'preference', versionKey: false })
export class PreferenceDoc {
  @Prop({ type: String })
  _id!: string;

  @Prop({ type: [String], default: [] })
  roleKeywords!: string[];

  @Prop({ type: Number, required: true })
  minMatch!: number;
}

export const PreferenceSchema = SchemaFactory.createForClass(PreferenceDoc);
