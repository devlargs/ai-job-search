---
title: 'Listings arrive from every adopted API and RSS board'
type: feature
ticket: '9'
created: '2026-11-27'
status: in-progress
baseline_revision: '28b1952d6f0c103d9a398c6f8128ec25600dbe2f'
route: full
route_source: auto
risk: medium
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/initiative-ai-job-search-v1/architecture-ai-job-search-v1/architecture-ai-job-search-v1.md'
  - '{project-root}/_bmad-output/initiative-ai-job-search-v1/tickets/epic-job-feed/spike-source-boards/spike-source-boards.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** R1: listings must come from every verified board. The signed-off source spike adopted RemoteOK, We Work Remotely, Himalayas and Jobicy, all API or RSS. Only Remotive is wired today.

**Approach:**
- Add one adapter per adopted board behind the `JobSource` port. Each maps to `ListingDraft` per the spike's field-mapping table and fetch notes, is tested against the spike's fixture, and is registered in `SOURCES`. `SourceId` gains `remoteok`, `we-work-remotely`, `himalayas` and `jobicy`.
- Each listing links to its original posting and credits its board, as each board's terms require.
- Extend the eligibility rules so the boards' location formats tag correctly.

## Boundaries & Constraints

**Always:**
- AD-2: adapters are plain classes with no Nest decorators. They fetch and map only; they never persist, sanitize, tag, or call another adapter. Each takes an injectable `url` and `fetchFn` like `RemotiveAdapter`, and sends `User-Agent: ai-job-search-local` with `AbortSignal.timeout(30000)`. A non-2xx response or an unparseable body throws. A single malformed item is skipped by returning only valid drafts; the pipeline's `ListingDraft` validation already counts invalid ones.
- **Fixed recent window, not `since`.** Every adapter returns the board's current recent window on every run and ignores `since` for stopping. Pruning (story 1.4) deletes listings whose `lastSeenAt` is older than `RETENTION_DAYS`, so an adapter that stopped at `since` would let still-open older jobs be pruned. That was the medium finding deferred from story 1.4. A listing drops out of the window and ages out `RETENTION_DAYS` later.
- Per board (from the spike):
  - **RemoteOK**: `GET https://remoteok.com/api`; skip element 0 (the legal notice); `minIntervalMin: 60`; `url` is the item's `url` on Remote OK; label "Remote OK".
  - **WWR**: `GET https://weworkremotely.com/remote-jobs.rss`; `minIntervalMin: 60`. The title is "Company: Title", split on the first ": "; with no ": ", company is `''`. `locationText = <region>` and `locationTags = [<country>]` when non-empty. `<state>` is ignored for eligibility, since the region is the signal (spike note).
  - **Himalayas**: `GET https://himalayas.app/jobs/api?limit=20`, then follow `nextCursor` via `&cursor=` for at most `HIMALAYAS_MAX_PAGES = 5` pages per run, which bounds the first run as well (the feed holds about 117k jobs). `url = applicationLink`, unchanged. `locationText = null` and `locationTags = locationRestrictions`. `pubDate` is epoch seconds. `minIntervalMin: 30`.
  - **Jobicy**: `GET https://jobicy.com/api/v2/remote-jobs?count=50`, one unfiltered page, so eligibility tags every listing including any worldwide ones. `locationText = jobGeo`. `minIntervalMin: 30`.
- RSS is parsed with one small, maintained XML parser dependency (`fast-xml-parser`) added to `apps/api`. HTML entities in `<description>` are decoded, and the sanitizer runs later in the pipeline as usual.
- The web's one `SOURCE_LABEL` map gains the four labels, and the "via <board>" credit appears in the feed row and the detail view (both already use the map).
- Eligibility data lives only in `eligibility-rules.json` (AD-4):
  - Add the boards' formats: `anywhere in the world` (already worldwide), `<x> only` phrases such as `usa only` and `canada only`, and common country names to `otherPlaces`, such as the US states' country and the European and LatAm countries seen in the fixtures.
  - Jobicy's comma lists ("Poland,  UK,  USA") work through the existing whole-word matching.
- Vitest fixture tests per adapter, with no live network in tests.

**Never:**
- No HTML scraping, no new eligibility logic in code, no per-board eligibility hints (the spike found none), and no change to throttle, pruning or tier logic.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| RemoteOK fixture | `__fixtures__/remoteok.json` | 4 drafts (legal element skipped), all valid, ISO `postedAt` | none |
| WWR fixture | `__fixtures__/we-work-remotely.xml` | 4 drafts; company and title split; region becomes `locationText`; `pubDate` parsed with zone | none |
| WWR title without ": " | `<title>Engineer</title>` | `company: ''`, `title: 'Engineer'` | none |
| Himalayas fixture | `__fixtures__/himalayas.json` | 4 drafts; `url = applicationLink`; tags = `locationRestrictions`; `postedAt` = `pubDate × 1000` | none |
| Himalayas paging | page 1 with `nextCursor`, page 2 without | 2 requests, items from both | none |
| Himalayas cap | every page has `nextCursor` | stops after 5 requests | none |
| Jobicy fixture | `__fixtures__/jobicy.json` | 4 drafts; `locationText = jobGeo` | none |
| Non-2xx | any adapter, status 429 or 500 | throws with the board name and status | pipeline records `ok:false` |
| Bad body | JSON without the expected array, or invalid XML | throws | pipeline records `ok:false` |
| Eligibility from fixtures | the four fixtures through `tagEligibility` | at least one non-restricted draft per fixture; "USA Only" and `['United States']` are restricted; "Anywhere in the World" is worldwide; "Asia Only" and "Australia,  New Zealand" are apac; `['Colombia',…,'Philippines']` is ph-friendly | none |

</intent-contract>

## Code Map

- `packages/shared/src/source-id.ts` -- extend the enum.
- `apps/api/src/sources/adapters/remoteok.adapter.ts`, `we-work-remotely.adapter.ts`, `himalayas.adapter.ts`, `jobicy.adapter.ts` (new), each with a `.spec.ts` beside it modelled on `remotive.adapter.spec.ts`. Fixtures already exist in `__fixtures__/` and are synthetic, with real wrappers. The Himalayas and Jobicy envelope counts describe the untrimmed page, so don't assert them.
- `apps/api/src/sources/sources.module.ts` -- add the four classes to `SOURCES`.
- `apps/api/package.json` -- add `fast-xml-parser`, pinned exactly like the other dependencies. Run `pnpm install` and commit the lockfile change.
- `apps/api/src/matching/data/eligibility-rules.json` -- the additions above. Add `apps/api/src/matching/board-fixtures.eligibility.spec.ts`, which runs each fixture through its adapter (with a fake fetch) and then `tagEligibility`, covering the matrix's eligibility row.
- `apps/web/src/sources.ts` -- the four labels: "Remote OK", "We Work Remotely", "Himalayas" and "Jobicy".
- `README.md` -- list the five sources and each one's credit/link rule in one short section.
- Do not touch ingestion, listings, preference or the throttle.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/source-id.ts` -- the ids.
- [x] The four adapters and their specs, plus `apps/api/package.json` and `pnpm-lock.yaml` for the XML parser -- the fetch and mapping.
- [x] `apps/api/src/sources/sources.module.ts` -- registration.
- [x] `eligibility-rules.json`, `board-fixtures.eligibility.spec.ts` -- tagging of the board formats.
- [x] `apps/web/src/sources.ts`, `README.md` -- credits and docs.

**Acceptance Criteria:**
- Given a running app with network access, when the boot run finishes, then `source_runs` has an `ok: true` record for each of `remoteok`, `we-work-remotely`, `himalayas` and `jobicy`, and `listings` holds stored listings from each.
- Given those stored listings, when `GET /api/feed` is called, then every item's `url` is an absolute link to the original posting, and the page shows "via <board>" for each.
- Given the four fixtures, when their adapter specs and the fixture eligibility spec run, then all pass, with at least one non-restricted listing per fixture.

## Implementation Notes

- Shared HTTP plumbing (User-Agent, 30 s timeout, non-2xx and bad-JSON throws, small field coercers) lives in `sources/adapters/board-fetch.ts`; it is a helper, not an adapter, so AD-2 still holds. Each adapter maps item by item and drops an item that is not an object or lacks an id or url; everything else is left to the pipeline's `ListingDraft` validation.
- WWR is parsed with `fast-xml-parser` 5.12.1 (`XMLValidator` first, so invalid XML throws), all values kept as strings, entities decoded in one pass.
- Live run 2026-11-27 (boot run): `remoteok` ok 100, `himalayas` ok 100 (5 pages), `jobicy` ok 50. `we-work-remotely` failed with `TimeoutError`: the board itself was down (a direct request returned a 503 "Application Error" page after 30 s). The pipeline recorded `ok:false` as designed. A few minutes later the feed answered 200; the built adapter, run directly against it, returned 100 valid drafts. It was not re-run through the pipeline because of its 60 min throttle.
- `GET /api/feed` after the run: items from remotive, remoteok, himalayas and jobicy, every `url` absolute.
- Spot-check mis-tags fixed in `eligibility-rules.json` (data gaps): Himalayas `["Armenia"]` fell to description text and tagged `apac` (now `armenia`, `azerbaijan`, `equatorial guinea` in `otherPlaces`; re-derive confirmed `restricted`); WWR "Oceania Only" was `unknown` (now `oceania` in `apac`). Also added the European and Latin American countries from the fixtures and four `<x> only` phrases.
- Watch item: live WWR items often pair region "Anywhere in the World" with a `<country>` such as "🇺🇸 United States of America". Per the plan that country goes into `locationTags`, so those items tag `restricted` (17 of 100 live). If `<country>` turns out to be the company HQ, not an applicant restriction, that mapping should be revisited.
- Himalayas items with an empty `locationRestrictions` (5 of 100 live) tag `unknown`; whether empty means worldwide is still unconfirmed (spike note).

## Plan Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm install && pnpm build && pnpm test` -- expected: exit 0; every new spec passes; `pnpm test` makes no network calls.
- `pnpm start` (background, network on; this makes one live run, which is about 7 requests in total and within each board's limits). After the boot run:
  - `mongosh ai-job-search --quiet --eval 'printjson(db.source_runs.aggregate([{$sort:{startedAt:-1}},{$group:{_id:"$source",ok:{$first:"$ok"},count:{$first:"$count"},error:{$first:"$error"}}}]).toArray()); printjson(db.listings.aggregate([{$group:{_id:{s:"$source",e:"$eligibility"},n:{$sum:1}}},{$sort:{"_id.s":1}}]).toArray())'` -- expected: `ok: true` with count > 0 for the four new sources, and a per-source eligibility breakdown.
  - Spot-check 5 random stored `locationText`/`locationTags` values per new source against their tag. Record any mis-tag in Implementation Notes and fix it in `eligibility-rules.json` if it is a data gap. This is the live-data check story 1.3's follow-up recommended.
  - `curl -s localhost:3000/api/feed` -- expected: items from the new sources with absolute `url`s.
  - Stop the server with `pkill -f dist/main.js` and confirm port 3000 is free.
