---
title: 'A listing opens to its full description and apply link'
type: feature
ticket: '8'
created: '2026-11-27'
status: built
baseline_revision: '11a0352e9e679979c351a9d1227930a0489ec572'
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
deferred:
  - summary: >-
      The web app has no tests, so the detail view's acceptance criterion 2 and its Deep link / Null posted date rows are covered only by the build and a bundle grep.
    evidence: |-
      apps/web has no spec files and runs `vitest run --passWithNoTests`; the spine's Tests convention lists Vitest in both apps.
      Settle it with a browser click-through (feed title, then #/listings/<id>, then the formatted description and Apply link with target=_blank)
      or with a jsdom + testing-library harness for apps/web, a natural refactor-sweep (entry 11) item.
    location: >-
      apps/web/src/ListingDetailView.tsx, App.tsx
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** R8: the user opens a listing to read its full job description and follows a link to the original posting to apply. Today the feed title links straight off-site, and the stored, sanitized description is never shown.

**Approach:** Add `GET /api/listings/:id`, which returns one non-restricted listing with its sanitized `descriptionHtml`. Add an in-app detail view, reached from a feed item, that shows the title, company, location, eligibility badge, posted and first-seen dates, and the "via <board>" credit. It renders the description through the one `JobDescription` component and has an "Apply on <board>" link that opens the original `url` in a new tab.

## Boundaries & Constraints

**Always:**
- Spine HTML convention: only sanitized `descriptionHtml` is stored, and the web renders it only through `JobDescription`, the one place that uses `dangerouslySetInnerHTML`. On read, the detail endpoint passes the stored HTML through the same `sanitizeHtml` again. That is idempotent and guards against rows edited outside ingestion.
- The contract is zod in `packages/shared`: `ListingDetail = FeedItem` minus `score`, plus `descriptionHtml: string`, `postedAt: ISO | null` and `firstSeenAt: ISO`. Dates are ISO 8601 UTC.
- An unknown id, a malformed id (not an ObjectId) or a `restricted` listing gets 404 `{ error: { code: 'not_found', message } }`. Restricted listings never reach the user (R3).
- `listings` stays read-only and reads through `ListingsReader` (AD-3).
- There is no router dependency. The view is chosen from `location.hash` (`#/listings/<id>`), and a `hashchange` listener handles back and forward. The feed title opens the detail view in-app, and the apply link is the only off-site link (`target="_blank" rel="noopener noreferrer"`).

**Never:**
- No tailoring or resume actions on the detail view (epic 2). No new adapters or board labels (story 1.9 adds them to the one `SOURCE_LABEL` map). The feed contract doesn't change.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Found | id of a stored worldwide listing | 200 `ListingDetail` with `descriptionHtml` | none |
| Script in stored HTML | stored html `<p>Hi</p><script>x()</script>` (row edited directly) | `descriptionHtml` is `<p>Hi</p>` with no script | none |
| Restricted | id of a restricted listing | 404 `not_found` | envelope |
| Unknown id | a valid ObjectId that isn't stored | 404 `not_found` | envelope |
| Malformed id | `abc` | 404 `not_found` (not 500) | envelope |
| Null posted date | `postedAt: null` | `postedAt: null`; the view shows only "First seen" | none |
| Deep link | page loaded at `#/listings/<id>` | detail view shown directly | 404 shows "Listing not found" with a back link |

</intent-contract>

## Code Map

- `packages/shared/src/listing-detail.schema.ts` (new) -- `ListingDetail`, exported from `index.ts`.
- `apps/api/src/ingestion/listings-reader.ts` -- add `findDetail(id): Promise<StoredListing | null>`. It returns null for an invalid ObjectId (`Types.ObjectId.isValid`, plus a 24-hex check) and queries `{ _id, eligibility: { $ne: 'restricted' } }`, projecting out `rulesHash` and `skills`.
- `apps/api/src/listings/listings.service.ts` -- `getDetail(id)` throws `NotFoundException('Listing not found')` when null, and maps with `sanitizeHtml(doc.descriptionHtml)`. Import `sanitizeHtml` from `ingestion/sanitize-html.ts`; don't copy it. `listings.controller.ts` -- `@Get('listings/:id')`.
- `apps/api/src/common/error-envelope.filter.ts` -- confirm that 404 maps to `code: 'not_found'`. Add it to `CODES` if missing.
- `apps/api/src/listings/listings.detail.spec.ts` (new) -- every API matrix row, with a fake model in the style of `listings.feed.spec.ts`.
- `apps/web/src/api.ts` -- `fetchListing(id, signal)`, parsed with `ListingDetail`, using the envelope message on error, and marking 404 so the view can say "not found".
- `apps/web/src/JobDescription.tsx` (new) -- the single sanitized-HTML renderer.
- `apps/web/src/ListingDetailView.tsx` (new):
  - The header holds the title, company, location, `EligibilityBadge` and dates ("Posted …" when present, "First seen …").
  - Below it are the "via <board>" credit, `JobDescription`, and "Apply on <board>".
  - A "← Back to feed" link sets `location.hash = ''`.
  - Loading, not-found and error states.
  - Move `SOURCE_LABEL` to `apps/web/src/sources.ts` so the feed and the detail view share it.
- `apps/web/src/App.tsx` -- read `location.hash` into state, listen for `hashchange`, and render the detail view or the feed. `ListingRow`'s title becomes `<a href={`#/listings/${item.id}`}>`. Keep the feed scroll simple; no restoration is needed. `styles.css` gets the detail layout and description typography (headings, lists, links).
- Do not touch ingestion logic, matching or adapters.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/listing-detail.schema.ts`, `index.ts` -- the contract.
- [x] `apps/api/src/ingestion/listings-reader.ts`, `listings/listings.service.ts`, `listings.controller.ts`, `common/error-envelope.filter.ts` -- the endpoint.
- [x] `apps/api/src/listings/listings.detail.spec.ts` -- the matrix rows.
- [x] `apps/web/src/api.ts`, `sources.ts`, `JobDescription.tsx`, `ListingDetailView.tsx`, `App.tsx`, `styles.css` -- the detail view.

**Acceptance Criteria:**
- Given a running app, when `GET /api/listings/<id of a feed item>` is called, then it returns 200 with a non-empty `descriptionHtml` and the item's `url`, and the body contains no `<script`.
- Given the built page, when a feed title is followed, then `#/listings/<id>` shows the description with its formatting (paragraphs and lists), and the "Apply on <board>" link has `target="_blank"` and points at the listing's `url`.
- Given a restricted listing's id or a malformed id, when the endpoint is called, then it answers 404 with `error.code` `not_found`.

## Implementation Notes

- `findDetail` returns a `DetailListing` (`StoredListing` minus `rulesHash` and `skills`), not `StoredListing`, so the type matches the projection. A malformed id returns null before any query runs.
- 404 was already in the filter's `CODES` as `not_found`, so there was no change to `error-envelope.filter.ts`.
- The web `readJson` now throws `ApiError` (an `Error` subclass with `status` and `notFound`). Existing callers still see a plain `Error` message.
- `App` picks the view from `#/listings/<id>` and listens for `hashchange`. The feed moved into a `Feed` component, which refetches when the user returns to it. On a view change the page scrolls to the top; scroll position isn't restored.
- Verified: `pnpm build && pnpm test` (api 137 tests passed). Live checks: real id 200 with `descriptionHtml` and `url`, no `<script`. `abc`, an unknown ObjectId and a restricted id all return 404 `not_found`. A script injected into a row was stripped on read, and the row was restored afterwards. `grep -c "Apply on"` on the bundle returned 1. Port 3000 was freed afterwards. No browser click-through was run, because the session couldn't pick a browser without asking the user; the bundle was checked for the hash link, `target:_blank` and `rel` on the apply link.

## Plan Change Log

## Review Triage Log

### 2026-11-27 — Review pass
- verdicts: 4 findings — high 0, medium 0, low 3, false 0, maybe-false 1
- findings:
  - `[low]` `[reject]` Links inside the description are also off-site, against the plan's "the apply link is the only off-site link" — they are sanitized and forced to `target=_blank rel=noopener noreferrer nofollow` by the one sanitizer. R8 does not exclude them, and only the plan's wording is stricter; the fix would edit the plan.
  - `[maybe-false]` `[defer]` AC 2 and the Deep link / Null posted date rows were never checked in a browser and the web app has no tests — recorded in `deferred` (medium, unverified) with what settles it.
  - `[low]` `[patch]` `#/listings/<id>/` or `?x` fell back to the feed — the hash pattern no longer anchors the end, so a trailing slash or query after the id is ignored.
  - `[low]` `[patch]` Switching views left focus on a removed link — `hashchange` now focuses the new view's `<h1 tabIndex={-1}>` (when the detail is still loading, the heading appears after the focus attempt; noted).

## Verification

**Commands:**
- `pnpm build && pnpm test` -- expected: exit 0; `listings.detail.spec.ts` covers the API matrix rows.
- `pnpm start` (background), then:
  - Take an id from `curl -s localhost:3000/api/feed`, then `curl -s localhost:3000/api/listings/<id>` -- expected: 200 with `descriptionHtml` and `url`, and no `<script`.
  - `curl -s -w '%{http_code}' localhost:3000/api/listings/abc` -- expected: 404 `not_found`.
  - The same for a restricted id taken from mongosh (`db.listings.findOne({eligibility:"restricted"})._id`) -- expected: 404.
  - Inject a script directly into one row with mongosh (`db.listings.updateOne({_id: ObjectId("<id>")}, {$set:{descriptionHtml:"<p>Hi</p><script>x()</script>"}})`), fetch it, and check there is no `<script`. First save the row's original `descriptionHtml` (`const orig = db.listings.findOne({_id: ObjectId("<id>")}).descriptionHtml`), and afterwards write it back with `updateOne`, so the DB ends unchanged.
  - Stop the server with `pkill -f dist/main.js` and confirm port 3000 is free.
- `grep -c "Apply on" apps/web/dist/assets/*.js` -- expected: ≥ 1.

## Auto Run Result

**Summary:**
- `GET /api/listings/:id` returns one non-restricted listing as `ListingDetail`, with its stored HTML passed through the one sanitizer again on read. An unknown, malformed or restricted id gets 404 `not_found`.
- The web has an in-app detail view on `#/listings/<id>`: header, dates, eligibility badge and "via <board>" credit, then the description through the single `JobDescription` component, then "Apply on <board>" in a new tab. Feed titles now open the detail view, and `SOURCE_LABEL` is shared from `sources.ts`.

**Files:**
- `packages/shared/src/listing-detail.schema.ts`: the contract.
- `apps/api/src/ingestion/listings-reader.ts` (`findDetail`), `listings/listings.service.ts` (`getDetail`), `listings.controller.ts`: the endpoint.
- `apps/api/src/listings/listings.detail.spec.ts`: the API matrix rows.
- `apps/web/src/api.ts` (`fetchListing`, `ApiError`), `sources.ts`, `JobDescription.tsx`, `ListingDetailView.tsx`, `App.tsx`, `styles.css`: the view.

**Review:** quick lens, 4 findings.
- 2 patched (low): the hash match and focus on view change.
- 1 deferred (medium, unverified): no web tests or browser check.
- 1 rejected: links inside the description.

**Follow-up review recommended:** false.

**Verification:**
- `pnpm build` passes, and `pnpm test` passes 137 tests.
- Live:
  - A feed id returns 200 with a 5443-character formatted description, with no `<script` and the Remotive `url`.
  - `abc`, an unknown ObjectId and a restricted id each give 404 `not_found`.
  - A script injected into the DB came back stripped, and the row was restored afterwards.
- The bundle has "Apply on" and the `#/listings/` links.

**Residual risks:**
- The view has not been clicked through in a browser.
- Focus can't reach the detail heading while it is still loading.

