---
id: 2
type: epic
title: "A confirmed master resume ranks the feed and tailors a PDF per job"
parent: initiative-ai-job-search-v1
covers: [R9, R10, R11, R12, R13]
sources: []
companions: []
after: [epic-job-feed]
refined: false
risk: medium
---

# A confirmed master resume ranks the feed and tailors a PDF per job

## Description

The user uploads a PDF CV once, then reviews and confirms the master resume Claude parses from it. The feed is then scored against that resume's skills, and any listing can produce a truth-checked tailored PDF to download. This epic owns the Claude gateway, the master and tailored resumes, and the PDF template. It supplies `resumeSkillSet()` and `resumeStatus` to epic 1's feed (initiative R9–R13).

## Outcome

The user sends each job a CV matched to its description, with no invented claims, in one click from the feed.

## Done when

- Uploading a PDF produces a draft master resume the user can correct and confirm; unmapped skills are shown.
- After confirmation, the feed shows match scores, and `minMatch` hides low matches.
- Tailoring any listing returns a downloadable PDF in the app's template, or a `422` that lists the violations.
- Claude is called only through the isolated gateway, and the smoke test shows no tools and no MCP servers.
- Unit tests for the AD-7 truth checks pass, and the whole flow works through `pnpm start`.

## Boundaries

- Out: fetching, eligibility and the feed query itself (epic-job-feed); notifications and application tracking (initiative Boundaries).
- Reuses from epic-job-feed: `skills.json`, `extractSkills`, `matchScore` and the score slot.

## References

- parent — _bmad-output/initiative-ai-job-search-v1/initiative-ai-job-search-v1.md, Requirements R9–R13
- architecture — _bmad-output/initiative-ai-job-search-v1/architecture-ai-job-search-v1/architecture-ai-job-search-v1.md, AD-5 to AD-8, AD-10

## Notes

- Waits on epic-job-feed because: it needs the scaffold, packages/shared, stored listings, the skill dictionary and the feed's score slot.
