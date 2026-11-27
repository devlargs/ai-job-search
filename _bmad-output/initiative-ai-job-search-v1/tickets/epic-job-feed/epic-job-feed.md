---
id: 1
type: epic
title: "Eligible remote jobs arrive in a ranked feed"
parent: initiative-ai-job-search-v1
covers: [R1, R2, R3, R4, R5, R6, R7, R8]
sources: []
companions: [_bmad-output/initiative-ai-job-search-v1/architecture-ai-job-search-v1/architecture-ai-job-search-v1.md]
after: []
risk: high
---

# Eligible remote jobs arrive in a ranked feed

## Description

The app runs on the user's machine and fetches every verified board at boot and then every 30 minutes into MongoDB. Restricted listings never reach the feed. The feed groups listings into freshness tiers, ordered by date until a resume is confirmed, filtered by the user's preference, with full job descriptions and apply links. This epic owns the platform baseline and the `matching` module that epic 2 builds on (initiative R1–R8).

## Outcome

The user opens one local page and sees only remote roles they are eligible for, freshest first, from every board that works.

## Requirements

- R1 (parent R1): listings come from Remotive, RemoteOK, We Work Remotely, Himalayas, Jobicy, OnlineJobs.ph, Jobstreet, Kalibrr; each source is verified usable before it is relied on; shown by listings from every verified source appearing in the feed.
- R2 (parent R2): listings refresh in the background on a schedule, default every 30 min, without user action; opening the app shows stored listings without waiting on any source.
- R3 (parent R3): every listing is tagged worldwide, APAC, PH-friendly, restricted, or unknown; the feed shows the first three, unknown with a warning badge, and never restricted.
- R4 (parent R4): the feed groups listings into freshness tiers (<24h, 1–3d, older) and orders each tier by match score against the user's CV skills.
- R5 (parent R5): listings below a user-set minimum match score, default 40%, are hidden.
- R6 (parent R6): when a listing's posted date is missing or unreliable, freshness uses the time the fetcher first saw it.
- R7 (parent R7): the user sets a role or skillset preference (e.g. Frontend, ReactJS) and the feed shows only listings matching it.
- R8 (parent R8): the user opens a listing to read its full job description and follow a link to the original posting to apply.

## Constraints

- C1 (parent C1): no paid services; data in local MongoDB; runs on the user's machine.
- C3 (parent C3): fetching, eligibility tagging and ranking use no LLM.
- C5 (parent C5): public APIs and RSS over HTML scraping; LinkedIn and Indeed are not sources.
- C7 (parent C7): v1 is time-boxed to about two weeks from 2026-11-27; HTML-scraped sources are cut first.

## Done when

- `pnpm build && pnpm start` serves the feed on `localhost:3000`, with listings from every source the spike verified, refreshed within the last 30 minutes.
- No listing tagged `restricted` appears in the feed, and `unknown` listings show the badge.
- The feed shows three tiers, each ordered by date, and the "no resume yet" banner while `resumeStatus` is `none`.
- Every listing opens to its sanitized full description and a working link to the original posting.
- Unit tests for `matching` and the ingestion date logic, plus fixture tests per adapter, pass.

## Boundaries

- Out: anything about resumes, Claude, tailoring or PDFs (epic-resume-tailoring).
- Owns, for epic 2's use: `matching/data/skills.json`, `extractSkills`, `matchScore`, the feed's score slot and the `resumeStatus` banner.
- Touch point: the 8 job boards, read only; MongoDB, configured here.

## References

- parent — _bmad-output/initiative-ai-job-search-v1/initiative-ai-job-search-v1.md, Requirements R1–R8
- architecture — _bmad-output/initiative-ai-job-search-v1/architecture-ai-job-search-v1/architecture-ai-job-search-v1.md, AD-1 to AD-4, AD-8, AD-9, Stack, Structural Seed

## Notes

- Open question: which of the 8 boards are usable, and how (API, RSS or HTML)? Story 2 (source spike) answers it.
- Decision (2026-11-27): refined from the initiative's lines and the architecture spine alone; eligibility phrases, skill synonyms and feed layout are left to the stories; no UX run.
- Decision (2026-11-27): the tracer bullet is story 1: the scaffold plus a Remotive-only path from fetch to the feed page. The source spike follows as the least certain part. HTML-scraped adapters are the last story so they are cut first.
- Decision (2026-11-27): Remotive's terms and fields are verified inside story 1, so the spike covers only the other 7 boards.
- Decision (2026-11-27): stories 3, 5, 6, 7 and 8 form one lane, because they all change the feed query, the listings module and the feed item. Stories 3, 4 and 6 share the ingestion pipeline. Story 6 ships a null resumeSkillSet() stub that epic 2 replaces.
