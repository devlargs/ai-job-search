import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { DEFAULT_PREFERENCE, Preference } from '@ai-job-search/shared';
import { ACTIVE_PREFERENCE_ID, PreferenceDoc } from './preference.schema.js';

/** Reads and writes the one active preference (AD-9). */
@Injectable()
export class PreferenceService {
  private readonly logger = new Logger('Preference');

  constructor(@InjectModel(PreferenceDoc.name) private readonly model: Model<PreferenceDoc>) {}

  /** The stored preference, or the defaults when there is none. */
  async get(): Promise<Preference> {
    const doc = await this.model.findById(ACTIVE_PREFERENCE_ID).lean<PreferenceDoc>().exec();
    if (!doc) return defaults();
    const parsed = Preference.safeParse({ roleKeywords: doc.roleKeywords, minMatch: doc.minMatch });
    if (parsed.success) return parsed.data;
    const issue = parsed.error.issues[0];
    this.logger.warn(
      `Stored preference is invalid, using defaults: ${issue ? `${issue.path.join('.')}: ${issue.message}` : 'unknown error'}`,
    );
    return defaults();
  }

  /** Upserts the single document and returns `p`, the validated value that was stored. */
  async set(p: Preference): Promise<Preference> {
    await this.model
      .updateOne(
        { _id: ACTIVE_PREFERENCE_ID },
        { $set: { roleKeywords: p.roleKeywords, minMatch: p.minMatch } },
        { upsert: true },
      )
      .exec();
    return { roleKeywords: [...p.roleKeywords], minMatch: p.minMatch };
  }
}

function defaults(): Preference {
  return { roleKeywords: [...DEFAULT_PREFERENCE.roleKeywords], minMatch: DEFAULT_PREFERENCE.minMatch };
}
