import { z } from 'zod';

/** The one shape every source adapter emits (AD-2). */
export const ListingDraft = z.object({
  sourceJobId: z.string().min(1),
  url: z.url({ protocol: /^https?$/ }),
  title: z.string(),
  company: z.string(),
  descriptionHtml: z.string(),
  locationText: z.string().nullable(),
  locationTags: z.array(z.string()),
  postedAt: z.date().nullable(),
});
export type ListingDraft = z.infer<typeof ListingDraft>;
