---
title: 'Restricted listings never reach the feed'
type: feature
ticket: '3'
created: '2026-11-27'
status: built
baseline_revision: '9508e5231d5397ac5c26636556ff60410258f848'
route: full
route_source: auto
risk: medium
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/initiative-ai-job-search-v1/architecture-ai-job-search-v1/architecture-ai-job-search-v1.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** The feed shows every stored listing, including ones a Philippines-based user cannot apply to ("US Only"). R3 needs each listing tagged worldwide, APAC, PH-friendly, restricted or unknown. The feed should show the first three, show unknown with a warning badge, and never show restricted.

**Approach:** Add a pure `matching` module with `tagEligibility` driven by `matching/data/eligibility-rules.json`, using AD-4's precedence: structured location fields, then the source hint, then description phrases, with restricted winning within a level. Ingestion tags every listing at upsert and stores `eligibility` and `rulesHash`. At boot it re-tags stored listings whose `rulesHash` differs from the current rule files. `GET /api/feed` drops restricted listings and carries each item's `eligibility`, and the web feed shows one shared unknown badge.

## Boundaries & Constraints

**Always:**
- AD-3 and AD-4 as written: `matching` exports pure functions only; rules live only in `matching/data/eligibility-rules.json`; `rulesHash` is a hash of the `matching/data/*.json` files; ingestion remains the only writer of `listings`; the feed reads through `ListingsReader`.
- Eligibility values: exactly `'worldwide' | 'apac' | 'ph-friendly' | 'restricted' | 'unknown'`, defined once as a zod enum `Eligibility` in `packages/shared`. `JobSource.eligibilityHint` uses it.
- The boot re-tag never blocks HTTP and runs inside the single-flight run, ahead of any fetch.
- Plain text for description phrases comes from the sanitized `descriptionHtml` with all tags stripped. Matching is case-insensitive on whole words or phrases.
- Vitest unit tests; no network in tests.

**Never:**
- No skills, scores, tiers, preference, retention or detail page (later stories). No LLM. No new adapters or board-specific rules (story 1.9 adds those).
- Never store `restricted` listings anywhere other than `listings`; never delete them (retention is story 1.4).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Restricted phrase | locationText "US Only" | `restricted` | none |
| Worldwide | locationText "Worldwide" or "Anywhere in the World" | `worldwide` | none |
| APAC | locationText "APAC" or "Asia" | `apac` | none |
| PH | locationText "Philippines" | `ph-friendly` | none |
| Only non-APAC places | locationText "USA, Canada" or tags `["United States"]` | `restricted` | none |
| Mixed list with APAC place | "Europe, USA, Singapore" | `apac` (no "only" phrase) | none |
| Restricted and positive at one level | "Worldwide, US only" | `restricted` | none |
| No location | locationText null, tags [] , no hint, no phrase | `unknown` | none |
| Falls to hint | no location, hint `ph-friendly` | `ph-friendly` | none |
| Falls to description | no location or hint, text "must be based in the United States" | `restricted` | none |
| Rules changed | stored `rulesHash` ≠ current | at boot every listing is re-tagged with the new hash, and the log has one line with the count | per-listing failure logged, not fatal |
| Untagged legacy row | stored before this story (no `eligibility`) | re-tagged at boot, since there is no `rulesHash` | none |
| Feed read | listings of all five tags | 200 `{ items }` with no restricted listings, each item carrying `eligibility` | as before |

</intent-contract>

## Code Map

- `packages/shared/src/eligibility.ts` (new) -- `Eligibility` zod enum; export it from `index.ts`. `feed.schema.ts` -- add `eligibility: Eligibility` to `FeedItem`.
- `apps/api/src/matching/` (new): `tag-eligibility.ts` (pure `tagEligibility({ locationText, locationTags, text, hint })`), `rules.ts` (loads and validates `data/eligibility-rules.json` with zod, and computes `rulesHash` as sha256 over the sorted `data/*.json` filenames and contents), `data/eligibility-rules.json`, `matching.module.ts` (exports a `MatchingRules` provider holding the parsed rules and hash), and specs. Resolve the data dir with `fileURLToPath(new URL('./data/', import.meta.url))`, so it works from `src` (vitest) and `dist`.
- `apps/api/nest-cli.json` -- add `compilerOptions.assets: [{ "include": "matching/data/*.json", "outDir": "dist" }]` so `dist/matching/data` exists after `nest build`. Without it, the built app cannot find the rules.
- `apps/api/src/sources/job-source.port.ts` -- type `eligibilityHint?: Eligibility`. Remotive sets none.
- `apps/api/src/ingestion/listing.schema.ts` -- add `eligibility` (String, enum, default `'unknown'`, indexed) and `rulesHash` (String, default null).
- `apps/api/src/ingestion/ingestion.service.ts` -- `upsertOp` gains `eligibility` and `rulesHash` in `$set`. Compute `text` from the sanitized HTML (`sanitize-html` with `allowedTags: []`), then `tagEligibility` with `source.eligibilityHint`. Add `retagIfRulesChanged()` and call it once at the start of the first `run()` (the boot run). It streams listings whose `rulesHash` ≠ current (including missing) and bulk-updates `eligibility` and `rulesHash`, looking up the hint by `source` from the injected `JOB_SOURCES`. Keep the single-flight, throttle and `source_runs` behavior unchanged.
- `apps/api/src/ingestion/ingestion.module.ts` -- import `MatchingModule`.
- `apps/api/src/ingestion/listings-reader.ts` -- `findFeed()` filters `{ eligibility: { $ne: 'restricted' } }`.
- `apps/api/src/listings/listings.service.ts` -- `toFeedItem` maps `eligibility` (a missing one becomes `'unknown'`).
- `apps/web/src/EligibilityBadge.tsx` (new) -- the one shared badge component: renders a warning badge for `unknown` and nothing for the others. `App.tsx` uses it in `.meta`; `styles.css` styles `.badge-unknown`.
- Reuse: `sanitizeHtml` (`ingestion/sanitize-html.ts`); the fixture `sources/adapters/__fixtures__/remotive.json` and the spike fixtures for realistic location strings. Do not change the adapters, throttle or effective-date logic.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/eligibility.ts`, `index.ts`, `feed.schema.ts` -- the `Eligibility` enum and the `FeedItem.eligibility` field -- one shared contract (AD-8).
- [x] `apps/api/src/matching/data/eligibility-rules.json`, `rules.ts`, `tag-eligibility.ts`, `matching.module.ts` -- the rules and the pure tagger -- AD-4.
- [x] `apps/api/src/matching/tag-eligibility.spec.ts`, `rules.spec.ts` -- one test per matrix tagging row; the hash changes when the rules content changes and stays the same otherwise.
- [x] `apps/api/nest-cli.json` -- copy `matching/data` to `dist`.
- [x] `apps/api/src/sources/job-source.port.ts`, `ingestion/listing.schema.ts`, `ingestion/ingestion.service.ts`, `ingestion/ingestion.module.ts` -- tag at ingest, store the hash, and re-tag at boot -- AD-3.
- [x] `apps/api/src/ingestion/ingestion.service.spec.ts` -- extend: an upsert carries `eligibility` and `rulesHash`; the boot re-tag updates rows with a stale or missing hash and leaves current ones alone; it runs once.
- [x] `apps/api/src/ingestion/listings-reader.ts`, `listings/listings.service.ts`, `listings/listings.feed.spec.ts` -- the restricted filter and `eligibility` on items; the test asserts the filter and the mapping.
- [x] `apps/web/src/EligibilityBadge.tsx`, `App.tsx`, `styles.css` -- the shared unknown badge.

**Acceptance Criteria:**
- Given a running app with stored listings, when `GET /api/feed` is called, then no item has `eligibility: "restricted"` and every item has one of the other four values.
- Given the feed page, when a listing is `unknown`, then it shows a visible "Location unclear" warning badge, and other listings show none.
- Given stored listings tagged under one rules hash, when a rule in `dist/matching/data/eligibility-rules.json` is edited and the app restarted, then the boot log reports listings re-tagged and their stored `rulesHash` equals the new hash.

## Implementation Notes

- `tagEligibility(input, rules)` takes the parsed rules as a second argument, so it stays pure. `MatchingRules` is a class token provided by `MatchingModule` through a factory that calls `loadMatchingRules()`. A missing or malformed rules file fails boot.
- Matching lowercases the text and turns each run of non-letters and non-digits into one space, then looks for whole padded phrases. "u.s. only" therefore matches the `u s only` entry.
- Plain text comes from `htmlToText` in `ingestion/sanitize-html.ts`. It adds a space before each tag, so adjacent blocks don't merge, then strips every tag.
- The rules file adds a few entries beyond the Design Notes seed, such as `americas`, `emea` and `european` (seen in real Remotive strings) and `must be located in`. `sea` was left out to avoid false APAC matches.
- The boot re-tag runs once per process, inside the first `run()` and before any source. A failed batch or row is logged and counted, and the fetch still goes ahead.

- Review patches (2026-11-27): place-neutral lead-ins ("must be based in" etc.) moved to `restrictedLeadIns`, which is restricted only when no PH/APAC term is named. At the structured level, non-APAC places (with no PH/APAC term) are checked before worldwide tokens. "ph" was dropped from `phFriendly` (it matched "Ph.D."). Description text counts only multi-word worldwide tokens. A re-tag cut short logs an error instead of "tags current". The asset copy uses `watchAssets`. `FeedListing` omits `rulesHash`.

## Plan Change Log

## Review Triage Log

### 2026-11-27 — Review pass
- verdicts: 7 findings — high 0, medium 3, low 4, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Place-neutral restricted lead-ins beat PH/APAC, so "Must be based in the Philippines" was hidden — moved to `restrictedLeadIns`, restricted only without a PH/APAC term; tests added.
  - `[medium]` `[patch]` "Anywhere in the US" tagged worldwide because the worldwide check preceded otherPlaces — at the structured level, otherPlaces-without-PH/APAC now returns restricted first; test added.
  - `[medium]` `[patch]` "ph" matched "Ph.D." and single-word "global"/"anywhere" in descriptions skipped the unknown badge — "ph" dropped; the description level uses multi-word worldwide tokens only; tests added.
  - `[low]` `[patch]` An early re-tag cursor failure logged "Eligibility tags current" — now logs a "Re-tag incomplete" error. The no-retry part is rejected: Mongo unreachable at boot fails the fetch too, and a retry adds a branch for a rare case.
  - `[low]` `[reject]` `matching` exports non-pure loaders and a Nest module, against AD-4's "pure functions only" — the plan's Code Map asks for them; the tagging logic is pure and no caller is harmed. Moving the loader means editing this plan.
  - `[low]` `[patch]` No `watchAssets`, so `pnpm dev` ignored rule edits — added.
  - `[low]` `[patch]` `FeedListing` still typed `rulesHash` after the projection — now omitted.

## Design Notes

Rules file shape (data, not code; extend freely):

```json
{ "restrictedPhrases": ["us only", "usa only", "uk only", "canada only", "europe only", "eu only", "must be based in", "must reside in", "only open to"],
  "worldwide": ["worldwide", "anywhere", "global", "anywhere in the world"],
  "phFriendly": ["philippines", "ph"],
  "apac": ["apac", "asia", "asia pacific", "southeast asia", "singapore", "malaysia", "japan", "australia", "new zealand", "india", "indonesia", "vietnam", "thailand"],
  "otherPlaces": ["usa", "us", "united states", "canada", "uk", "united kingdom", "europe", "eu", "germany", "mexico", "latam", "colombia", "brazil", "..."] }
```

Per level (structured location, then description phrases), the tag is decided in this order:
1. Any restricted phrase gives `restricted`. AD-4 says restricted beats every other tag within a level, so "Worldwide, US only" is restricted.
2. PH gives `ph-friendly`.
3. An APAC place gives `apac`.
4. A worldwide token gives `worldwide`.
5. At the structured level only, naming only `otherPlaces` gives `restricted`.
6. Otherwise the level gives no answer, and the next level is tried.

A level that answers wins, and when nothing answers the tag is `unknown`. Order between the positive tags runs from most specific to the user (PH) to least (worldwide). The hint sits between the two levels.

## Verification

**Commands:**
- `pnpm build` -- expected: exit 0, and `apps/api/dist/matching/data/eligibility-rules.json` exists.
- `pnpm test` -- expected: all specs pass, including the new matching specs and the extended ingestion and feed specs.
- `pnpm start` (background), then `curl -s localhost:3000/api/feed` -- expected: 200; no `"restricted"` in the body; every item has `eligibility`. The boot log shows the 1.1-era listings re-tagged.
- `mongosh ai-job-search --quiet --eval 'db.listings.aggregate([{$group:{_id:"$eligibility",n:{$sum:1}}}]).toArray()'` -- expected: every stored listing has a tag, and the restricted ones are in the DB but absent from the feed.
- Edit one phrase in `apps/api/dist/matching/data/eligibility-rules.json`, restart, and check the log and `db.listings.distinct("rulesHash")` -- expected: a re-tag log line and one new hash. Afterwards, run `pnpm build` to restore the file.

## Auto Run Result

**Summary:** Listings are tagged worldwide, apac, ph-friendly, restricted or unknown by a pure `matching` module driven by `matching/data/eligibility-rules.json`. The precedence is AD-4's: structured location, then the source hint, then description phrases, with restricted winning within a level. Ingestion stores `eligibility` and `rulesHash` at upsert, and the boot run re-tags every stored listing whose hash is stale or missing, ahead of any fetch and without blocking HTTP. `GET /api/feed` drops restricted listings and carries each item's `eligibility`, and the web feed shows one shared "Location unclear" badge for unknown.

**Files:**
- `packages/shared/src/eligibility.ts`, `index.ts`, `feed.schema.ts`: the `Eligibility` enum and `FeedItem.eligibility`.
- `apps/api/src/matching/*`: the rules file, its loader and hash, the pure tagger, the Nest provider and the specs.
- `apps/api/nest-cli.json`: copies `matching/data` to `dist`, with `watchAssets`.
- `apps/api/src/sources/job-source.port.ts`: `eligibilityHint` is typed `Eligibility`.
- `apps/api/src/ingestion/*`: the schema fields, `htmlToText`, tagging at upsert, the boot re-tag and the extended specs.
- `apps/api/src/ingestion/listings-reader.ts`, `listings/listings.service.ts`, `listings.feed.spec.ts`: the restricted filter and the eligibility mapping.
- `apps/web/src/EligibilityBadge.tsx`, `App.tsx`, `styles.css`: the shared unknown badge.

**Review:** quick lens, 7 findings.
- 6 patched: 3 medium and 3 low.
- 0 deferred.
- 1 rejected: the non-pure exports from `matching`, which the plan asks for.

**Follow-up review recommended:** true. Three medium entries were patched, and two or more mediums sets the flag. The unverified risk is the patched tagging precedence (the lead-in and otherPlaces ordering) against real board location strings. The unit tests cover the reported cases, but stories 1.9's live data may expose others.

**Verification:**
- `pnpm build` passes, and `dist/matching/data/eligibility-rules.json` exists.
- `pnpm test`: 7 files, 61 tests pass.
- Live boot: "Re-tagged 17 listings for rules 05c1190a63e2", logged after "Listening". The DB holds 8 restricted, 6 worldwide and 3 APAC listings under one hash. `/api/feed` returns 9 items with no restricted.
- The rule-edit check ran twice: once by the implementer on `dist`, and once through the real rules change made by the review patches.

**Residual risks:**
- The unknown badge was not seen in a browser, since no stored listing is unknown right now.
- Description-phrase tagging is heuristic and data-tunable.
- A re-tag that stops early is not retried until the next restart.

