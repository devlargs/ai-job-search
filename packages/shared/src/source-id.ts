import { z } from 'zod';

/** Kebab-case ids of the job boards the app reads from. */
export const SourceId = z.enum(['remotive', 'remoteok', 'we-work-remotely', 'himalayas', 'jobicy']);
export type SourceId = z.infer<typeof SourceId>;
