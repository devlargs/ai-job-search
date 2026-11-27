import type { Eligibility } from '@ai-job-search/shared';

/** The one shared eligibility badge (UI states convention): a warning for `unknown`, nothing otherwise. */
export function EligibilityBadge({ eligibility }: { eligibility: Eligibility }) {
  if (eligibility !== 'unknown') return null;
  return (
    <span className="badge badge-unknown" title="We could not tell where this job accepts applicants from">
      Location unclear
    </span>
  );
}
