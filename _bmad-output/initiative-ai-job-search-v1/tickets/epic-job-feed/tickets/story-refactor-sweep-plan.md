---
title: 'Refactor sweep (job feed epic)'
type: refactor
ticket: '11'
created: '2026-11-27'
status: built
baseline_revision: 'cfd82f339d59117b3bd46ac4f57fdd61e6d18863'
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

**Problem:** The epic's builds left four deferred findings and one review note marked for this sweep. Cleanup only; scope pushed out of another story would be a new story.

**Approach:** Resolve each item below, or record why it stays open:

1. **AD-8 validation (story 1.7 note).** `PUT /api/preference` validates by hand with `Preference.safeParse`. The spine says bodies are validated "through Nest 12's Standard Schema support, not class-validator". Switch to `@Body(new StandardSchemaValidationPipe(Preference, …))`, keeping the 400 `{ error: { code: 'bad_request', message } }` envelope and the message shape (`Invalid preference: <path>: <message>`).
2. **A throwing `resumeSkillSet()` (story 1.6 deferred, medium unverified).** `getFeed` reads it with no fallback, so a throw would 500 the feed against AD-4's "always 200". Catch it, log a warning, and score with null, the same way the preference read falls back.
3. **No web tests (story 1.8 deferred, plus story 1.9's page check).** Add Vitest specs to `apps/web` with no new dependencies. Render components with `react-dom/server`'s `renderToStaticMarkup` in Node, and cover:
   - a feed row shows "via <label>" for each of the five sources;
   - the detail body renders the description HTML and an "Apply on <board>" link with `target="_blank"`, `rel="noopener noreferrer"` and the listing's `url`;
   - a null `postedAt` shows only "First seen";
   - `listingIdFromHash` (export it) accepts `#/listings/<id>`, `#/listings/<id>/` and `#/listings/<id>?x`, and rejects the rest.
   Export `ListingRow` and `ListingBody` as needed.
4. **Pruning versus `since` (story 1.4 deferred, medium).** Resolved by story 1.9: every adapter fetches a fixed recent window and ignores `since`. Record it; no code.

## Boundaries & Constraints

**Always:** Behavior is unchanged except the two fixes in items 1 and 2. Every existing test passes, and the new tests are part of `pnpm test`.

**Never:** No new features, dependencies, endpoints or schema changes, no dependency bumps, and no edits to other stories' plans.

</intent-contract>

## Code Map

- `apps/api/src/preference/preference.controller.ts` -- swap the manual parse for `StandardSchemaValidationPipe` from `@nestjs/common`. Its options include an `exceptionFactory(issues)`; use it to throw `BadRequestException` with the same message format. Update `preference.controller.spec.ts`, which calls `controller.put(...)` directly, so the invalid-body cases still exercise the pipe. Instantiate the pipe in the spec, or go through a Nest testing module, whichever needs no new dependency.
- `apps/api/src/listings/listings.service.ts` -- wrap the `resumeSkillSet()` read like the existing `readPreference` fallback. Add a `listings.feed.spec.ts` case where `resumeSkillSet` throws: the feed returns 200 data with null scores and logs a warning.
- `apps/web/src/App.tsx`, `ListingDetailView.tsx` -- export `listingIdFromHash`, `ListingRow` and `ListingBody` with no behavior change. New `apps/web/src/*.spec.tsx` files. `apps/web/vite.config.ts` or a `vitest.config.ts` needs `environment: 'node'` (the default) and the shared alias, if `@ai-job-search/shared` must resolve to `src` as in `apps/api/vitest.config.ts`. `apps/web/tsconfig.json` must still type-check the specs during `pnpm build`.

## Tasks & Acceptance

**Execution:**
- [x] `apps/api/src/preference/preference.controller.ts` and its spec -- item 1.
- [x] `apps/api/src/listings/listings.service.ts`, `listings.feed.spec.ts` -- item 2.
- [x] `apps/web/src/App.tsx`, `ListingDetailView.tsx`, the new specs, and the web vitest config -- item 3.

**Acceptance Criteria:**
- Given the repo, when `pnpm test` runs, then both apps run real specs (web no longer passes with zero tests) and all pass.
- Given a running app, when `PUT /api/preference` gets `{"roleKeywords":[],"minMatch":150}`, then the response is 400 with `error.code` `bad_request` and a message starting `Invalid preference: minMatch`. A valid PUT still returns the saved preference.

## Implementation Notes

- Item 1: `PUT /api/preference` now takes `@Body({ schema: Preference, pipes: [preferenceBodyPipe] })`, where `preferenceBodyPipe` is a `StandardSchemaValidationPipe` whose `exceptionFactory` (`invalidPreference`) builds the same `BadRequestException('Invalid preference: <path>: <message>')` from the first issue. The pipe's default `transform: true` hands the handler the parsed value, so trimming and de-duplication still apply. The spec's `put()` helper reads the `@Body` route-args metadata off `PreferenceController.put` and runs its pipes with its schema before the handler, so the spec fails if the wiring is removed. Added message-shape cases (minMatch, roleKeywords.0, missing body).
- Item 2: `ListingsService.readResumeSkills()` wraps `resumeSkillSet()`; on a throw it logs a `Listings` warning and returns null, so every score is null and the feed still returns. New `listings.feed.spec.ts` case covers it.
- Item 3: `ListingRow` and `listingIdFromHash` (App.tsx) and `ListingBody` (ListingDetailView.tsx) are exported, unchanged otherwise. New `apps/web/vitest.config.ts` (node environment, shared alias to `packages/shared/src`, `src/**/*.spec.{ts,tsx}`), added to `apps/web/tsconfig.json`'s `include` so `pnpm build` type-checks it with the specs. The alias uses `new URL(...).pathname` because the web app has no `@types/node`. New `App.spec.tsx` and `ListingDetailView.spec.tsx` (21 tests). `--passWithNoTests` dropped from the web `test` script so a missing spec suite fails instead of passing silently.
- Item 4: no code. Story 1.9 made every adapter fetch a fixed recent window and ignore `since`, so pruning by `lastSeenAt` no longer conflicts with incremental fetches. Closed.

## Plan Change Log

- Item 1: Nest 12.6.3's `StandardSchemaValidationPipe` constructor takes only options; the schema comes from the parameter metadata. Used `@Body({ schema: Preference, pipes: [pipe] })` instead of `new StandardSchemaValidationPipe(Preference, …)`. Same intent, real API.

## Review Triage Log

### 2026-11-27 — Review pass
- verdicts: 2 findings — high 0, medium 0, low 2, false 0, maybe-false 0
- findings:
  - `[low]` `[reject]` The controller spec runs the declared pipe itself rather than through Nest's router, so a regression only in the real request path (e.g. a new global pipe) would slip by — the plan allowed this to avoid a new dependency, and the live-server 400 check covers the real path.
  - `[low]` `[reject]` The web vitest alias uses `new URL(...).pathname`, which would mis-resolve on Windows — the app runs locally on macOS only (architecture), and the web app has no `@types/node` for `fileURLToPath`.

## Verification

**Commands:**
- `pnpm build && pnpm test` -- expected: exit 0; the web package reports its spec files and test counts.
- `pnpm start` (background); the two `PUT /api/preference` calls from the second acceptance criterion; reset with `{"roleKeywords":[],"minMatch":40}`; stop the server with `pkill -f dist/main.js` and confirm port 3000 is free.

**Results (2026-11-27):**
- `pnpm build && pnpm test`: exit 0. api 18 files / 186 tests, web 2 files / 21 tests, all passing.
- Running app: invalid PUT -> 400 `{"error":{"code":"bad_request","message":"Invalid preference: minMatch: Too big: expected number to be <=100"}}`; valid PUT `{"roleKeywords":[" React ","react"],"minMatch":55}` -> 200 `{"roleKeywords":["React"],"minMatch":55}`; reset to `{"roleKeywords":[],"minMatch":40}` -> 200; `GET /api/feed` -> 200. Server stopped, port 3000 free.

## Auto Run Result

**Summary:** Cleanup sweep for the job feed epic. Each deferred item or review note is resolved or recorded:
1. `PUT /api/preference` validates through Nest 12's `StandardSchemaValidationPipe` (AD-8), with the same 400 envelope and message.
2. A throwing `resumeSkillSet()` falls back to null scores with a warning, so the feed stays 200 (deferred from story 1.6).
3. `apps/web` has its first real specs (21 tests via `renderToStaticMarkup`, no new dependencies). They cover the "via <board>" credits, the detail body and apply link, a null posted date, and hash parsing, which settles the page checks deferred from stories 1.8 and 1.9 at the markup level. `--passWithNoTests` is removed.
4. Pruning versus `since` (deferred from story 1.4) was already resolved by story 1.9's fixed fetch windows, and is recorded here.

**Files:**
- `apps/api/src/preference/preference.controller.ts` and its spec.
- `apps/api/src/listings/listings.service.ts`, `listings.feed.spec.ts`.
- `apps/web/src/App.tsx`, `ListingDetailView.tsx` (exports only).
- `apps/web/src/App.spec.tsx`, `ListingDetailView.spec.tsx`.
- `apps/web/vitest.config.ts`, `tsconfig.json`, `package.json`.

**Review:** quick lens, 2 findings. 0 patched, 0 deferred, and 2 rejected (low: the spec's hand-run pipe, and the macOS-only alias path).

**Follow-up review recommended:** false.

**Verification:**
- `pnpm build` passes. `pnpm test` passes api 186 and web 21.
- Live: `minMatch: 150` gives 400 `bad_request` "Invalid preference: minMatch: …". A valid PUT returns the normalized preference, and the DB was reset to the defaults.

**Residual risk:** the web specs render static markup, so there is still no in-browser click-through.

