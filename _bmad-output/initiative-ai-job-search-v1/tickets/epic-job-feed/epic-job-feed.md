---
id: 1
type: epic
title: "Eligible remote jobs arrive in a ranked feed"
parent: initiative-ai-job-search-v1
covers: [R1, R2, R3, R4, R5, R6, R7, R8]
sources: []
companions: []
after: []
refined: false
risk: high
---

# Eligible remote jobs arrive in a ranked feed

## Description

The app runs on the user's machine and fetches every verified board at boot and then every 30 minutes into MongoDB. Restricted listings never reach the feed. The feed groups listings into freshness tiers, ordered by date until a resume is confirmed, filtered by the user's preference, with full job descriptions and apply links. This epic owns the platform baseline and the `matching` module that epic 2 builds on (initiative R1–R8).

## Outcome

The user opens one local page and sees only remote roles they are eligible for, freshest first, from every board that works.

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

- Open question: which of the 8 boards are usable, and how (API, RSS or HTML)? This epic opens with a spike that answers it.
