---
title: 'The feed is grouped into freshness tiers'
type: feature
ticket: '5'
created: '2026-11-27'
status: built
baseline_revision: '64771513a808b8bdb016faca6144f866092e4462'
route: full
route_source: auto
risk: low
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/initiative-ai-job-search-v1/architecture-ai-job-search-v1/architecture-ai-job-search-v1.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `GET /api/feed` returns one flat list, newest first. R4 asks for freshness tiers, and AD-4 fixes the shape: tiers by `effectiveDate`, each ordered by score then date, and a `resumeStatus` on the response. The page needs the three tiers and a "no resume yet" banner while there is no resume.

**Approach:** The feed response becomes `{ resumeStatus, tiers }`. Listings are grouped at read time against the current time: `fresh` is 24h or less, `recent` is over 24h up to 72h, and `older` is over 72h. Each tier is sorted by score descending with null last, then `effectiveDate` descending. `resumeStatus` is always `'none'` until epic-resume-tailoring. The web renders the three tiers in order and one shared `ResumeStatusBanner` component.

## Boundaries & Constraints

**Always:**
- The contract is one zod schema in `packages/shared` (AD-8): `FeedResponse = { resumeStatus: ResumeStatus, tiers: { fresh: FeedItem[], recent: FeedItem[], older: FeedItem[] } }`, with `ResumeStatus = z.enum(['none','draft','confirmed'])`.
- Tier boundaries are inclusive at the top: exactly 24h is `fresh`, and exactly 72h is `recent`. An `effectiveDate` in the future (clock skew) is `fresh`.
- The grouping and sorting is a pure function `groupIntoTiers(items, now)` in `listings`, with unit tests at each edge.
- The score sort is in place now. Items carry no score yet (story 1.6 adds it), so the comparator reads an optional `score` and every item sorts as null, which leaves date order.
- `GET /api/feed` stays 200 for any DB state, the restricted filter from story 1.3 stays, and each item keeps its `eligibility`.

**Never:**
- No score computation, skills, preference, min-match or detail page (stories 1.6–1.8). No resume module: `resumeStatus` is a constant `'none'` from `ListingsService`.
- No second banner component, and no per-tier fetch.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fixture ages | listings at now−2h, now−30h, now−5d | one each in `fresh`, `recent`, `older` | none |
| 24h edge | now−24h exactly | `fresh` | none |
| Just past 24h | now−24h−1ms | `recent` | none |
| 72h edge | now−72h exactly | `recent` | none |
| Just past 72h | now−72h−1ms | `older` | none |
| Future date | now+1h | `fresh` | none |
| Order within tier | same tier, scores null | `effectiveDate` desc | none |
| Score order (unit) | items with scores 80, null, 40 in one tier | 80, 40, null; ties by date desc | none |
| Empty DB | no listings | `{ resumeStatus: 'none', tiers: { fresh: [], recent: [], older: [] } }` | none |

</intent-contract>

## Code Map

- `packages/shared/src/feed.schema.ts` -- add `ResumeStatus`, `FeedTiers` and the new `FeedResponse`. Export them from `index.ts`. `FeedItem` is unchanged.
- `apps/api/src/listings/feed-tiers.ts` (new) -- `TIER_BOUNDS_MS = { fresh: 24h, recent: 72h }`, `tierOf(effectiveDate, now)`, and `groupIntoTiers<T extends { effectiveDate: string; score?: number | null }>(items, now)`, which returns `{ fresh, recent, older }` with each tier sorted.
- `apps/api/src/listings/listings.service.ts` -- `getFeed(now = new Date())` maps docs with `toFeedItem` (unchanged) and returns `{ resumeStatus: 'none', tiers: groupIntoTiers(items, now) }`. `ListingsReader.findFeed()` keeps its query, filter and sort.
- `apps/api/src/listings/feed-tiers.spec.ts` (new) -- every matrix row. `listings.feed.spec.ts` -- update to the new shape (assert `tiers.*` and `resumeStatus`; keep the restricted, eligibility and error-envelope tests).
- `apps/web/src/ResumeStatusBanner.tsx` (new) -- the one shared banner. For `none` it renders a notice: "No resume yet — listings are ordered by date. Upload your resume to rank them by match." It renders nothing for `confirmed`, and for `draft` it shows "Resume draft not confirmed yet."
- `apps/web/src/App.tsx` -- render the banner, then three `<section>`s with the headings "Last 24 hours", "1–3 days ago" and "Older". Each section reuses the existing listing row markup, with its `EligibilityBadge` and "via" credit; extract it to a `ListingRow` component in the same file. An empty tier shows "Nothing in this window". The loading, error and all-empty states stay. `styles.css` gets the tier headings and banner styles.
- Do not change ingestion, matching or adapters.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/feed.schema.ts`, `index.ts` -- the new contract.
- [x] `apps/api/src/listings/feed-tiers.ts`, `feed-tiers.spec.ts` -- the pure grouping and sort, with every matrix row tested.
- [x] `apps/api/src/listings/listings.service.ts`, `listings.feed.spec.ts` -- the tiered response with `resumeStatus: 'none'`.
- [x] `apps/web/src/ResumeStatusBanner.tsx`, `App.tsx`, `styles.css` -- the tiers and banner on the page.

**Acceptance Criteria:**
- Given a running app, when `curl localhost:3000/api/feed` is called, then the JSON has `resumeStatus: "none"` and `tiers.fresh`, `tiers.recent` and `tiers.older` arrays. Every item is in the tier its `effectiveDate` age implies, and no item is restricted.
- Given the built page, when it loads, then it shows the "No resume yet" banner and three tier sections in the order fresh, recent, older, each with its listings or "Nothing in this window".

## Implementation Notes

- `index.ts` already re-exports `feed.schema.ts` with `export *`, so it needed no edit. The row markup moved into `ListingRow` in `App.tsx`. The banner renders once the feed has loaded, including when it is empty.

## Plan Change Log

## Review Triage Log

### 2026-11-27 — Review pass
- verdicts: 2 findings — high 0, medium 0, low 2, false 0, maybe-false 0
- findings:
  - `[low]` `[patch]` The README still documented `GET /api/feed` as `{ items }` — updated to the tiered shape.
  - `[low]` `[reject]` An all-empty feed shows the "No listings yet" notice instead of three empty sections — the plan's Code Map keeps the all-empty state on purpose. It only happens before the first fetch, and the notice tells the user more than three empty sections would.

## Verification

**Commands:**
- `pnpm build && pnpm test` -- expected: exit 0; `feed-tiers.spec.ts` covers every matrix row; the updated feed spec passes.
- `pnpm start` (background); `curl -s localhost:3000/api/feed` -- expected: `resumeStatus` is `none`, and the three tier arrays together hold every feed listing in its correct tier. Compute the ages from `effectiveDate` against `date -u`. Then stop the server (`pkill -f dist/main.js`) and confirm port 3000 is free.
- `grep -c "Last 24 hours" apps/web/dist/assets/*.js` -- expected: ≥ 1, so the built bundle has the tier headings and the banner text.

## Auto Run Result

**Summary:** `GET /api/feed` now returns `{ resumeStatus: 'none', tiers: { fresh, recent, older } }`. Listings are grouped at read time by `effectiveDate` age: 24h or less, over 24h to 72h, and over 72h, with the top edge of each tier inclusive and future dates counted as fresh. Each tier is sorted by score descending with null last, then by date, and items carry no score yet. The page shows one shared `ResumeStatusBanner` and three tier sections.

**Files:**
- `packages/shared/src/feed.schema.ts`: `ResumeStatus`, `FeedTiers` and the tiered `FeedResponse`.
- `apps/api/src/listings/feed-tiers.ts` and its spec: the pure grouping and sort, with every matrix row tested.
- `apps/api/src/listings/listings.service.ts`, `listings.feed.spec.ts` and the controller comment: the tiered response.
- `apps/web/src/ResumeStatusBanner.tsx`, `App.tsx`, `styles.css`: the banner, the tier sections and `ListingRow`.
- `README.md`: the API shape.

**Review:** quick lens, 2 findings.
- 1 patched (low): the README.
- 0 deferred.
- 1 rejected (low): the all-empty state, which the plan keeps on purpose.

**Follow-up review recommended:** false.

**Verification:**
- `pnpm build` passes, and `pnpm test` passes 80 tests.
- Live: `resumeStatus` is `none`, and all 9 feed listings are in `older` (15+ days old), none restricted. The built bundle has the tier headings and banner text.

**Residual risks:** the fresh and recent tiers were not seen with live data, because Remotive is delayed 24h and was throttled, and the page was not opened in a browser.

