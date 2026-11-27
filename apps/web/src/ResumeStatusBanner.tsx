import type { ResumeStatus } from '@ai-job-search/shared';

/** The one shared resumeStatus banner (UI states convention): nothing once a resume is confirmed. */
export function ResumeStatusBanner({ status }: { status: ResumeStatus }) {
  if (status === 'confirmed') return null;
  return (
    <p className={`banner banner-${status}`} role="status">
      {status === 'none'
        ? 'No resume yet — listings are ordered by date. Upload your resume to rank them by match.'
        : 'Resume draft not confirmed yet.'}
    </p>
  );
}
