import { z } from 'zod';

/** A listing's eligibility for a Philippines-based applicant (R3, AD-4). */
export const Eligibility = z.enum(['worldwide', 'apac', 'ph-friendly', 'restricted', 'unknown']);
export type Eligibility = z.infer<typeof Eligibility>;
