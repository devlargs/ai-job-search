---
title: 'Every listing carries skills and a score slot'
type: feature
ticket: '6'
created: '2026-11-27'
status: built
baseline_revision: '2f95aed817e1f9da20e0d56e3579f935083243c9'
route: full
route_source: auto
risk: medium
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/initiative-ai-job-search-v1/architecture-ai-job-search-v1/architecture-ai-job-search-v1.md'
warnings: []
deferred:
  - summary: >-
      A real resumeSkillSet() that throws would turn GET /api/feed into a 500, against AD-4's "always 200".
    evidence: |-
      listings.service.ts getFeed awaits Promise.all([findFeed(), resumeSkillSet()]) with no fallback. Today's stub returns null and
      cannot throw, so this is unreachable. When epic-resume-tailoring replaces the stub, catch its failure and score with null instead.
    location: >-
      apps/api/src/listings/listings.service.ts getFeed
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** R4 and R5 rank and hide listings by match score against the user's CV skills, and AD-4 fixes how: `extractSkills` over a listing's text, `matchScore` from job skills against `resumeSkillSet()`, and a feed that drops non-null scores below `minMatch`. Today listings have no skills, feed items have no score, and nothing provides a resume skill set.

**Approach:**
- Add `matching/data/skills.json` (canonical `SkillId` mapped to synonyms) and a pure `extractSkills(text)`.
- Ingestion stores `skills` at upsert, from the title plus the sanitized description text. The boot re-derive from story 1.3 now refreshes `skills` along with `eligibility` whenever `rulesHash` changes. `skills.json` is already inside the hashed `data/*.json`.
- Add a pure `matchScore(jobSkills, resumeSkillSet)`.
- The feed reads `resumeSkillSet()` from a stub in a new `resume` module that always returns null. It computes each item's `score`, which is null for now, drops items whose score is non-null and below `minMatch`, and then tiers them.
- `minMatch` is the constant `DEFAULT_MIN_MATCH = 40` until story 1.7 makes it a preference.

## Boundaries & Constraints

**Always:**
- AD-4: `matching` functions are pure. Rules live only in `matching/data/*.json`. `matchScore` returns null when `jobSkills` is empty or `resumeSkillSet` is null, and otherwise `round(100 × |jobSkills ∩ resumeSkillSet| / |jobSkills|)`. Scores are computed at feed read and never stored.
- `SkillId` is a string id from `skills.json` keys (lowercase kebab, e.g. `react`, `nestjs`). `extractSkills` returns unique ids in `skills.json` key order. Matching is case-insensitive and whole-word, using the same normalization as the eligibility tagger (reuse and export it, don't copy it), so "ReactJS", "React.js" and "react" all map to `react`.
- `FeedItem` gains `score: number | null` in `packages/shared`. The tier sort from story 1.5 already orders by it.
- The stub is the only source of the resume skill set: `ResumeSkills.resumeSkillSet(): Promise<ReadonlySet<string> | null>` in `apps/api/src/resume/`. It returns null and carries a comment that epic-resume-tailoring replaces it (AD-6).
- Vitest unit tests; no network in tests.

**Never:**
- No preference document or settings form, and no role-keyword filter (story 1.7). No resume upload or parsing (epic 2). Skills are not shown in the UI in this story.
- `skills` is never written by any module other than ingestion.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Synonyms | text "ReactJS and Nest.js" | `['react','nestjs']` (key order) | none |
| Whole word | text "reaction nesting" | `[]` | none |
| Duplicates | "React, react.js, REACT" | `['react']` | none |
| Score overlap | job `[react,nestjs,aws]`, resume `{react,nestjs}` | `67` | none |
| Full overlap | job `[react]`, resume `{react,vue}` | `100` | none |
| Empty job skills | job `[]`, resume `{react}` | `null` | none |
| No resume | job `[react]`, resume `null` | `null` | none |
| No overlap | job `[go]`, resume `{react}` | `0` | none |
| Feed, no resume | any listings | every item has `score: null`; nothing is hidden | none |
| Feed, scored (unit) | scores 80, 39, null with minMatch 40 | 80 and null kept, 39 dropped | none |
| Rules changed | `skills.json` edited | at boot, stored listings get re-derived `skills` and the new `rulesHash` | as story 1.3 |

</intent-contract>

## Code Map

- `apps/api/src/matching/data/skills.json` (new). Seed it with common web and backend skills, each with synonyms. It must include `react` (`react`, `reactjs`, `react.js`) and `nestjs` (`nestjs`, `nest.js`), plus at least typescript, javascript, node (`node.js`, `nodejs`, `node`), python, java, go (`golang` only, because "go" is a common word), aws, docker, kubernetes, postgres, mongodb, graphql, vue, angular, nextjs, tailwind.
- `apps/api/src/matching/rules.ts` -- validate `skills.json` (record of string id to a non-empty string array) and add `skills` to `LoadedMatchingRules`. `MatchingRules` in `matching.module.ts` gains a `skills` field. Update the `new MatchingRules(...)` call sites in specs.
- `apps/api/src/matching/tag-eligibility.ts` -- export `normalize` and `mentions`, or move them to a small `matching/text-match.ts` that both use.
- `apps/api/src/matching/extract-skills.ts` and `match-score.ts` (new), with specs.
- `apps/api/src/ingestion/listing.schema.ts` -- add `skills: string[]`, default `[]`.
- `apps/api/src/ingestion/ingestion.service.ts` -- `upsertOp` `$set` gains `skills: extractSkills(title + ' ' + text, rules.skills)`. Rename `retagIfRulesChanged` to `rederiveIfRulesChanged` and project `title`. Each update sets `eligibility`, `skills` and `rulesHash`. Keep the log wording "Re-tagged N listings…" or change it to "Re-derived…", and update the specs to match.
- `apps/api/src/resume/resume-skills.ts` and `resume.module.ts` (new) -- the stub provider, exported.
- `apps/api/src/listings/listings.service.ts` -- inject `ResumeSkills`. In `getFeed`: read the set once, map `toFeedItem(doc, score)` where `score = matchScore(doc.skills ?? [], set)`, filter `score === null || score >= DEFAULT_MIN_MATCH`, then `groupIntoTiers`. Export `DEFAULT_MIN_MATCH = 40` from `listings`. `listings.module.ts` imports `ResumeModule`. `ListingsReader.findFeed` must return `skills`; it currently projects out only `descriptionHtml` and `rulesHash`.
- `packages/shared/src/feed.schema.ts` -- `FeedItem.score: z.number().int().min(0).max(100).nullable()`.
- Specs: `extract-skills.spec.ts`, `match-score.spec.ts`, ingestion (upsert carries skills; re-derive refreshes skills), and `listings.feed.spec.ts` (no-resume nulls; a minMatch filter test injecting a fake `ResumeSkills`).
- Do not touch the web app, adapters or eligibility rules.

## Tasks & Acceptance

**Execution:**
- [x] `apps/api/src/matching/*` -- skills.json, rules loading, shared text matching, `extractSkills`, `matchScore` and their specs.
- [x] `apps/api/src/ingestion/listing.schema.ts`, `ingestion.service.ts`, `ingestion.service.spec.ts` -- skills at ingest and in the boot re-derive.
- [x] `apps/api/src/resume/resume-skills.ts`, `resume.module.ts` -- the null stub.
- [x] `packages/shared/src/feed.schema.ts`; `apps/api/src/listings/listings.service.ts`, `listings.module.ts`, `listings.feed.spec.ts`; `apps/api/src/ingestion/listings-reader.ts` -- the score slot and the minMatch filter.

**Acceptance Criteria:**
- Given a stored listing whose title or description mentions "ReactJS" and "Nest.js", when ingestion upserts it or the boot re-derive runs, then its stored `skills` contains `react` and `nestjs`.
- Given no confirmed resume, when `GET /api/feed` is called, then every item has `score: null`, and the item count equals that of a build without the minMatch filter.
- Given the first boot after this change, when the app starts, then every stored listing has a `skills` array, and the stored `rulesHash` equals the hash that now includes `skills.json`.

## Implementation Notes

- Shared whole-word matching moved to `matching/text-match.ts` (`normalize`, `mentions`); `tag-eligibility.ts` imports it.
- `extractSkills(text, skills)` matches only a key's synonyms, never the key itself, so `go` is found through `golang` alone. Synonyms that normalize badly were left out of the seed: `js` (every `x.js`), `ts`, `c#` (becomes `c`) and `.net` (becomes `net`).
- `skills.json` is validated as lowercase-kebab ids mapped to non-empty arrays of synonyms that each contain a letter or digit.
- `matchScore` counts unique job skills.
- `getFeed` reads the reader and `resumeSkillSet()` in parallel. The stub logs "Re-derived eligibility and skills of N listings…".
- Observed on live data: listings from vetting marketplaces carry a boilerplate block that names about 20 stacks, so they get long skill lists, and once a resume exists their scores will be low. That is correct by AD-4 but worth watching.

## Plan Change Log

## Review Triage Log

### 2026-11-27 — Review pass
- verdicts: 4 findings — high 0, medium 0, low 3, false 0, maybe-false 1
- findings:
  - `[low]` `[reject]` "React Native" also yields `react` (and "Ruby on Rails" yields `ruby` and `rails`) — it only shifts scores once a resume exists (epic 2), and fixing it needs longest-match suppression in `extractSkills`, which is more than a direct correction. `ruby` plus `rails` is arguably right.
  - `[low]` `[patch]` Bare `swift` and `rails` synonyms match ordinary English ("a swift process", "guard rails") — narrowed to `swiftui`, `swift 5`, `swift developer`… and `ruby on rails`, `rails 7`, `rails developer`…; test added.
  - `[low]` `[reject]` Implementation Notes attribute the "Re-derived…" log to the stub — the fix edits this build's plan; the code is correct (the log is in `IngestionService.rederiveIfRulesChanged`).
  - `[maybe-false]` `[defer]` A throwing `resumeSkillSet()` would 500 the feed — unreachable with the null stub; recorded in `deferred` (medium, unverified) for epic-resume-tailoring.

## Verification

**Commands:**
- `pnpm build && pnpm test` -- expected: exit 0; `dist/matching/data/skills.json` exists; the new and updated specs pass.
- `pnpm start` (background), then `mongosh ai-job-search --quiet --eval 'print(db.listings.countDocuments({skills:{$exists:false}}), JSON.stringify(db.listings.aggregate([{$unwind:"$skills"},{$group:{_id:"$skills",n:{$sum:1}}},{$sort:{n:-1}},{$limit:8}]).toArray()), db.listings.distinct("rulesHash").length)'` -- expected: `0`, a non-empty top-skills list and `1`. Then `curl -s localhost:3000/api/feed`: every item has `"score":null`, with the same item count as before the change (9 with today's data). Stop the server with `pkill -f dist/main.js` and confirm port 3000 is free.

## Auto Run Result

**Summary:**
- `matching/data/skills.json` (51 skills) and a pure `extractSkills` give every listing a `skills` array. It is stored at upsert from the title plus the sanitized text, and re-derived at boot with `eligibility` whenever `rulesHash` changes.
- A pure `matchScore` implements AD-4's formula and null cases.
- The feed reads `resumeSkillSet()` from a null stub in a new `resume` module, puts `score` on every item, and drops non-null scores below `DEFAULT_MIN_MATCH = 40`. Story 1.7 makes that threshold a preference.

**Files:**
- `apps/api/src/matching/*`: `skills.json`, the shared `text-match.ts`, `extract-skills.ts`, `match-score.ts`, the rule loading and the specs.
- `apps/api/src/ingestion/*`: the `skills` field, skills at upsert, and `rederiveIfRulesChanged`.
- `apps/api/src/resume/*`: the `ResumeSkills` null stub.
- `packages/shared/src/feed.schema.ts`: `FeedItem.score`.
- `apps/api/src/listings/*`: scoring and the minMatch filter.

**Review:** quick lens, 4 findings.
- 1 patched (low): the common-word synonyms.
- 1 deferred (medium, unverified): a throwing `resumeSkillSet()`.
- 2 rejected: the React Native overlap, which needs new matching logic and matters only once a resume exists, and the plan-note wording.

**Follow-up review recommended:** false.

**Verification:**
- `pnpm build` passes and `dist/matching/data/skills.json` exists. `pnpm test` passes 101 tests.
- Live: every stored listing has `skills`, with javascript, react and nextjs the most common, under one hash. The feed returns the same 9 items, all with `score: null`. After the synonym patch, the boot log showed a re-derive under the new hash.

**Residual risks:**
- Boilerplate-heavy descriptions yield long skill lists, which will lower scores once a resume exists.
- The React Native/React overlap.

