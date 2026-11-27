---
type: initiative
title: "Eligible remote roles found early, with a CV tailored to each"
sources: [_bmad-output/forge-ai-job-search/forge-ai-job-search.md]
companions: [_bmad-output/initiative-ai-job-search-v1/architecture-ai-job-search-v1/architecture-ai-job-search-v1.md]
after: []
risk: medium
---

# Eligible remote roles found early, with a CV tailored to each

## Description

A local web app that gathers remote job listings from several remote and Philippines-focused boards in the background. It shows only the roles a Philippines-based applicant can take, puts the freshest and best-matched ones first, and tailors the user's CV to a chosen job as a downloadable PDF. It exists because the user, jobless and with no budget, keeps reaching postings after 100+ people have already applied (forged idea, "Core pain").

## Outcome

A jobless Philippines-based developer applies early to remote roles they are eligible for, with a CV matched to each job; success is measured by recruiter responses.

## Requirements

- R1 (Locked: Sources): listings come from Remotive, RemoteOK, We Work Remotely, Himalayas, Jobicy, OnlineJobs.ph, Jobstreet, Kalibrr; each source is verified usable before it is relied on; shown by listings from every verified source appearing in the feed.
- R2 (Locked: Fetching): listings refresh in the background on a schedule, default every 30 min, without user action; opening the app shows stored listings without waiting on any source.
- R3 (Locked: Eligibility first): every listing is tagged worldwide, APAC, PH-friendly, restricted, or unknown; the feed shows the first three, unknown with a warning badge, and never restricted.
- R4 (Locked: Ranking): the feed groups listings into freshness tiers (<24h, 1–3d, older) and orders each tier by match score against the user's CV skills.
- R5 (Locked: Ranking): listings below a user-set minimum match score, default 40%, are hidden.
- R6 (Locked: Ranking): when a listing's posted date is missing or unreliable, freshness uses the time the fetcher first saw it.
- R7 (Discover intent, core flow): the user sets a role or skillset preference (e.g. Frontend, ReactJS) and the feed shows only listings matching it.
- R8 (Discover intent, core flow): the user opens a listing to read its full job description and follow a link to the original posting to apply.
- R9 (Locked: Resume): the user uploads a PDF CV once and gets a structured master resume (summary, skills, experience, projects) parsed by Claude.
- R10 (Locked: Resume): the user reviews and corrects the master resume before it is used for matching or tailoring.
- R11 (Locked: Resume): for a chosen listing, the user gets a resume tailored to its job description, built only from the master resume.
- R12 (Locked: Resume): the tailored resume downloads as a PDF in the app's own ATS-friendly template.
- R13 (Locked: Ranking + Resume): match scores use the skills in the reviewed master resume.

## Constraints

- C1 (Forged idea, zero budget): no paid services; data is stored in local MongoDB; the app runs on the user's machine.
- C2 (Locked: Claude): Claude is called only through Claude Code headless (`claude -p`) on the user's subscription, with no API key, and only for resume parsing and tailoring.
- C3 (Locked: Claude): fetching, eligibility tagging and ranking use no LLM: rules and a skill dictionary with synonyms.
- C4 (Locked: Guardrail): tailoring reorders and rewords facts from the master resume only; it never invents skills or experience.
- C5 (Locked: Sources; Rejected): public APIs and RSS are preferred over HTML scraping; LinkedIn and Indeed are not sources (crowded feed, fragile, ToS risk).
- C6 (Risks: subscription limits): Claude runs only on an explicit user action, never in bulk over the feed.
- C7 (Risks: build vs apply time): v1 is time-boxed to about two weeks from 2026-11-27; scope that threatens the box is cut, not extended.

## Done when

- Opening the app shows, without waiting, a feed of remote roles from every verified source, refreshed within the last 30 minutes, containing no restricted listings.
- The feed is grouped by freshness tier and ordered by match against the user's reviewed master resume.
- From any listing, the user downloads a tailored PDF CV whose every claim traces to the master resume.
- The whole app runs locally with zero paid services and no Claude API key.
- The user has applied to real jobs using the app within the two-week time box.

## Boundaries

- Out: push notifications (Telegram, email, browser).
- Out: application tracking and response-rate stats (parked post-v1).
- Out: LinkedIn and Indeed as sources.
- Out: preserving the original CV's design.
- Out: LLMs for fetching, eligibility or ranking; local embeddings (parked post-v1).
- Out: auto-applying, multi-user use, hosting.
- Tracer path: a listing is fetched in the background → tagged eligible → ranked against the master resume → opened in the feed → tailored → downloaded as a PDF.

## References

- forged idea — _bmad-output/forge-ai-job-search/forge-ai-job-search.md, sections Locked, Rejected, Parked, Risks
- forge report — _bmad-output/forge-ai-job-search/forge-report.html
- architecture — _bmad-output/initiative-ai-job-search-v1/architecture-ai-job-search-v1/architecture-ai-job-search-v1.md, AD-1 to AD-10, Stack, Deferred

## Notes

- Assumption: single user, local only, no login.
- Assumption: applying happens on the original posting's site; the app links out and does not auto-apply.
- Assumption: Claude Code CLI is installed and signed in on the user's machine.
- Open question: which of the 8 sources expose usable feeds, and do any forbid automated access? The feed epic waits on it.
- Decision (2026-11-27): the tech stack is settled by the architecture spine; fetching runs only while the app runs (AD-1); one active preference (AD-9); one tailored resume per job (AD-7).
