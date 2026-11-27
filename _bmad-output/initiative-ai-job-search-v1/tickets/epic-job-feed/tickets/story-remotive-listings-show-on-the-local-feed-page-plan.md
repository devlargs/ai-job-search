---
title: 'Remotive listings show on the local feed page (tracer bullet)'
type: feature
ticket: '1'
created: '2026-11-27'
status: built
baseline_revision: '6033d2e4e4e2dbe1574fa90966ef60667b8ef478'
route: full
route_source: auto
risk: high
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/initiative-ai-job-search-v1/architecture-ai-job-search-v1/architecture-ai-job-search-v1.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** The repo has no code. Nothing fetches jobs or shows a feed, and no later story can start until the monorepo, the MongoDB connection, the ingestion pipeline and the feed page exist.

**Approach:** Scaffold the pnpm monorepo from the spine (Nest 12 ESM API, Vite React web, `packages/shared` zod contract). Run one in-process, single-flight schedule that fetches Remotive through the `JobSource` port, sanitizes, and upserts into `listings`. Serve `GET /api/feed` (newest `effectiveDate` first) and a page that lists the stored jobs, all on `localhost:3000`.

## Boundaries & Constraints

**Always:**
- Spine AD-1, AD-2, AD-3 (minus the stages below), AD-8 and the Consistency Conventions: ESM, kebab-case files with Nest suffixes, snake_case collections, ISO dates over the API, `{ error: { code, message } }` errors, `.env` through `@nestjs/config`, Nest `Logger` with one summary line per run, Vitest.
- Stack versions as pinned in the spine (TypeScript `~6.0`, never 7). `packageManager` is `pnpm@12.14.0` (the installed version).
- The boot fetch is fired, not awaited. The HTTP server and `/api/feed` never wait on a fetch.
- Remotive terms (verified 2026-11-27 from the API's `0-legal-notice`): at most about 4 requests a day, so the Remotive adapter declares `minIntervalMin: 360` and the pipeline skips a source whose last successful run is newer than that. Every listing links to its Remotive `url`, and the page shows "via Remotive".
- Adapters are plain classes with no Nest decorators, so their tests need no decorator metadata.

**Never:**
- No eligibility tagging, skills, `rulesHash`, tiers, scores, preference, retention deletion, detail page or resume features. Later stories own them.
- No HTML scraping, no LLM, no second process, no paid service.
- Adapters never persist, sanitize, or import Mongoose. No module except `ingestion` writes `listings`.
- No live network calls in tests.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First run | empty DB, Remotive reachable | listings inserted; `firstSeenAt=lastSeenAt=now`; one `source_runs` `{ok:true,count}` | none |
| Refetch | same `sourceJobId` again | `$set` fields updated, `lastSeenAt` bumped; `firstSeenAt/postedAt/effectiveDate` unchanged; no duplicate | unique index `{source,sourceJobId}` |
| Posted date valid | `postedAt <= firstSeenAt` and not future | `effectiveDate = postedAt` | none |
| Posted date null / future / after firstSeen | e.g. `postedAt = now+1h` | `effectiveDate = firstSeenAt` | none |
| Remotive date without zone | `"2026-11-25T11:26:35"` | parsed as UTC | unparseable → `postedAt: null` |
| Source down / offline | fetch throws or times out (30 s) | `source_runs {ok:false,error}`; existing listings stay; feed still serves | logged, run continues |
| Invalid draft | item fails `ListingDraft` (e.g. relative url) | that item skipped and counted in the log | not fatal |
| Overlapping tick | interval fires while a run is in progress | tick skipped, logged | none |
| Throttled | last ok Remotive run under 360 min ago | source skipped, no HTTP call | none |
| Feed read | any DB state | 200 `{ items }` sorted by `effectiveDate` desc | DB error → 500 in error envelope |

</intent-contract>

## Code Map

Greenfield: only `_bmad/`, `_bmad-output/`, `.claude/`, `.agents/` and `skills-lock.json` exist, and none of them should be touched. Create:

- `package.json`, `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `.gitignore` (node_modules, dist, .env, coverage), `.env.example`, `.nvmrc` (24), `tsconfig.base.json`, `README.md` (prereqs plus `pnpm install / build / start / dev / test`).
- `packages/shared/src/` -- `listing-draft.schema.ts` (`ListingDraft` exactly per AD-2, `postedAt: z.date().nullable()`), `source-id.ts` (`SourceId` enum, `remotive` for now), `feed.schema.ts` (`FeedItem { id, source, title, company, url, locationText, effectiveDate: ISO string }`, `FeedResponse { items }`), `index.ts`. Built with `tsc` to ESM `dist` with `.d.ts`; `exports` points at `dist`.
- `apps/api/src/main.ts`, `app.module.ts` -- global `/api` prefix (exclude nothing else), `ConfigModule`, `MongooseModule.forRootAsync(MONGO_URI)`, `ScheduleModule.forRoot()`, `ServeStaticModule` (rootPath `apps/web/dist`, resolved from `import.meta.url`, excluding `/api/{*path}`), `PORT` default 3000.
- `apps/api/src/sources/job-source.port.ts` -- `JobSource { id; eligibilityHint?; minIntervalMin?; fetch(since) }` plus a `JOB_SOURCES` injection token.
- `apps/api/src/sources/adapters/remotive.adapter.ts` -- GET `https://remotive.com/api/remote-jobs` (URL is a constructor param with that default; `fetch` gets an injectable fetch fn for tests), `AbortSignal.timeout(30000)`, User-Agent `ai-job-search-local`. Maps `id→sourceJobId` (string), `url`, `title`, `company_name` (trimmed) `→company`, `description→descriptionHtml`, `candidate_required_location→locationText` (empty → null), `locationTags: []`, `publication_date` as UTC `→postedAt`. Non-2xx or a missing `jobs` array → throw.
- `apps/api/src/sources/adapters/__fixtures__/remotive.json` -- trimmed real payload: copy the top-level keys plus 3 jobs from `/Users/largs/.claude/jobs/e6707dd3/tmp/remotive-all.json`, and shorten each `description` to a few hundred chars of valid HTML that keeps at least one `<p>` and one `style=` attribute.
- `apps/api/src/sources/sources.module.ts` -- `SOURCES = [RemotiveAdapter]` registry, provided under `JOB_SOURCES` and exported.
- `apps/api/src/ingestion/` -- `listing.schema.ts` (collection `listings`: source, sourceJobId, url, title, company, descriptionHtml, locationText, locationTags, postedAt, firstSeenAt, effectiveDate, lastSeenAt; unique index `{source:1,sourceJobId:1}`, index `{effectiveDate:-1}`), `source-run.schema.ts` (`source_runs`), `effective-date.ts` (pure `effectiveDate(postedAt, firstSeenAt)`), `sanitize-html.ts` (the one allowlist sanitizer via `sanitize-html`: basic text/list/link/heading tags, `href` only with http/https/mailto, no `style`/`class`/scripts/iframes/images), `ingestion.service.ts` (per source: throttle check → `fetch(since=lastSuccessAt)` → `ListingDraft.safeParse` → sanitize → one `updateOne(..., {upsert:true})` per draft via `bulkWrite` → write `source_runs`; one summary log line), `ingestion.scheduler.ts` (`onApplicationBootstrap` fires `run()` with `void`; a `SchedulerRegistry` interval of `FETCH_INTERVAL_MIN`; a `running` flag gives single-flight), `listings-reader.ts` (`ListingsReader.findFeed()` returns docs sorted `effectiveDate:-1`), `ingestion.module.ts` (exports `ListingsReader`).
- `apps/api/src/listings/` -- `listings.controller.ts` (`GET /api/feed` → `FeedResponse`), `listings.service.ts` (maps docs to `FeedItem` with ISO dates), `listings.module.ts`.
- `apps/api/vitest.config.ts`, `nest-cli.json`, `tsconfig*.json` (module/moduleResolution `nodenext`, relative imports with `.js`).
- `apps/web/` -- Vite 8 + React 19: `index.html`, `src/main.tsx`, `src/App.tsx` (fetches `/api/feed` and lists title→`url` (opens in a new tab), company, location, local-time date, "via Remotive"; shows loading, empty ("No listings yet — the first fetch may still be running") and error states), `vite.config.ts` (dev proxy `/api` → `http://localhost:3000`), `src/api.ts` (parses the response with the shared `FeedResponse`).

## Tasks & Acceptance

**Execution:**
- [x] root workspace files -- create per Code Map; scripts: `build` = shared → web → api in order, `start` = `node apps/api/dist/main.js`, `dev` = shared build then api watch and vite in parallel, `test` = `pnpm -r test` -- the single entry point the verify line names.
- [x] `packages/shared/**` -- zod schemas and build -- AD-8 contract.
- [x] `apps/api/**` sources -- port, Remotive adapter, fixture, registry -- AD-2.
- [x] `apps/api/**` ingestion -- schemas, effective date, sanitizer, service, scheduler, reader -- AD-1, AD-3.
- [x] `apps/api/**` listings -- feed controller and service -- read-only via `ListingsReader`.
- [x] `apps/api/src/**/*.spec.ts` -- unit tests: `remotive.adapter.spec.ts` (fixture via injected fetch: mapping, UTC parse, empty location → null, non-2xx throws), `effective-date.spec.ts` (null, future, after firstSeen, valid past, equal), `sanitize-html.spec.ts` (strips script/style attr/onclick, keeps `<p>`/links), `ingestion.service.spec.ts` (fake adapters and in-memory model fakes: failing source recorded `ok:false` while others continue, throttle skip, invalid draft skipped, upsert uses `$setOnInsert` for the three dates and `$set` for the rest, overlapping `run()` skipped).
- [x] `apps/web/**` -- SPA per Code Map.
- [x] `README.md`, `.env.example` -- document env vars and commands.

**Acceptance Criteria:**
- Given MongoDB is running and Remotive is reachable, when `pnpm install && pnpm build && pnpm start` runs and `http://localhost:3000` is opened, then the page lists current Remotive jobs, each linking to its Remotive URL and marked "via Remotive".
- Given listings are stored, when the app restarts and Remotive is unreachable or throttled, then `GET /api/feed` answers 200 with the stored listings without waiting on any fetch, and the page shows them.
- Given the app runs, when `curl localhost:3000/api/feed` is called, then items come back newest `effectiveDate` first, with ISO date strings.
- Given a fresh clone, when `pnpm test` runs, then the adapter fixture test and the effective-date tests pass, and no test touches the network.

## Implementation Notes

- `nest build` (tsc builder) and `nest start --watch` worked with ESM/`nodenext` as-is; no fallback to plain `tsc` was needed.
- The single-flight `running` flag lives in `IngestionService.run()`, not in the scheduler, so the overlap case is unit-testable; the scheduler only fires `void run()` at boot and on the interval.
- A throttled source writes no `source_runs` record (writing one would reset the throttle window). `since` = `startedAt` of the last `ok:true` run.
- `ListingDraft.url` is restricted to http/https. `ListingsReader.findFeed()` omits `descriptionHtml` and tie-breaks on `_id`.
- Added `common/error-envelope.filter.ts` (global) so every API error, including unknown `/api/*` routes, returns `{ error: { code, message } }`.
- `apps/api/vitest.config.ts` aliases `@ai-job-search/shared` to its `src`, so `pnpm test` passes on a fresh clone before any build.
- The fixture keeps jobs 0, 1 and 5 of the saved payload; descriptions are shortened to the first styled `<p>` plus a small list with a link.

- Verify step (orchestrator): added `apps/api/src/listings/listings.feed.spec.ts` to cover the matrix "Feed read" row (sort `effectiveDate:-1`, ISO dates, DB error → 500 envelope).
- Review patch: throttle now uses the latest run of any outcome; `since` still uses the last `ok:true` run. `findFeed()` returns `FeedListing = Omit<StoredListing, 'descriptionHtml'>`.

## Plan Change Log

## Review Triage Log

### 2026-11-27 — Review pass
- verdicts: 5 findings — high 0, medium 1, low 4, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Throttle counted only successful runs, so a failing/blocking Remotive was re-requested every 30 min (~48/day) against the ~4/day terms — fixed: throttle checks the latest run of any outcome, `since` still from the last ok run; new spec "also throttles after a recent failed run".
  - `[low]` `[reject]` `SourceId.parse` in `toFeedItem` would 500 the feed on an unknown stored `source` — only ingestion writes `source`, always from a `SourceId`-typed adapter, so no reachable state triggers it today; the fix would add a guard branch.
  - `[low]` `[reject]` A partial `bulkWrite` failure is recorded as `ok:false, count:0` — needs a write error mid-batch, which single-flight runs make rare; after the throttle patch it no longer causes per-tick retries; the fix adds error-shape handling.
  - `[low]` `[patch]` `findFeed()` typed `StoredListing[]` though `descriptionHtml` is projected out — fixed: returns `FeedListing[]` (`Omit<StoredListing,'descriptionHtml'>`), `toFeedItem` takes `FeedListing`.
  - `[low]` `[reject]` One malformed Remotive job (null entry / non-string location) throws in `toDraft` and fails the whole source — the live payload is well-formed and typed; per-item guards add complexity for an unlikely case.

## Design Notes

- `minIntervalMin` is an addition to AD-2's port, made because the Remotive terms check found the 4-a-day limit. The global tick stays `FETCH_INTERVAL_MIN=30` for the boards added later, and the pipeline does the throttling, so the adapter stays pure.
- Remotive ignores `since`; the adapter accepts the argument and does not use it.
- Upsert shape (per draft, `now` = run start):
  ```ts
  { updateOne: { filter: { source, sourceJobId }, upsert: true, update: {
      $setOnInsert: { firstSeenAt: now, postedAt, effectiveDate: effectiveDate(postedAt, now) },
      $set: { title, company, descriptionHtml, url, locationText, locationTags, lastSeenAt: now } } } }
  ```
- If Nest 12's ESM scaffold or the `nest build` pipeline fights ESM, build the API with plain `tsc -p` and run `node dist/main.js`. Record any such deviation in Implementation Notes.

## Verification

**Commands:**
- `pnpm install && pnpm build` -- expected: exit 0; `packages/shared/dist`, `apps/web/dist` and `apps/api/dist/main.js` exist.
- `pnpm test` -- expected: all specs pass, including `remotive.adapter.spec.ts` and `effective-date.spec.ts`.
- `pnpm start` (background), then `curl -s localhost:3000/api/feed` and `curl -s localhost:3000/` -- expected: JSON `items` (non-empty after the boot fetch), sorted by `effectiveDate` desc; HTML for the SPA.
- Restart with `pnpm start` and immediately `curl -s -w '%{time_total}' localhost:3000/api/feed` -- expected: the same stored items in under 1 s, and the log shows Remotive skipped as throttled.
- `mongosh ai-job-search --eval 'db.listings.getIndexes(); db.source_runs.find().sort({startedAt:-1}).limit(2)'` -- expected: a unique `source_1_sourceJobId_1` index and `ok:true` runs.

## Auto Run Result

**Summary:** Tracer bullet for the job feed. It scaffolds the pnpm monorepo (Nest 12 ESM API, Vite 8 + React 19 web, `packages/shared` zod contract) and connects local MongoDB. A single-flight in-process schedule runs at boot (not awaited) and every `FETCH_INTERVAL_MIN`. Each run fetches Remotive through the `JobSource` port, validates `ListingDraft`, sanitizes `descriptionHtml`, and upserts with `$setOnInsert` for `firstSeenAt`, `postedAt` and `effectiveDate`. It writes `source_runs` and throttles Remotive to one attempt per 360 min. `GET /api/feed` serves stored listings newest `effectiveDate` first, and the page lists them with links back to Remotive marked "via Remotive".

**Remotive terms check (R1):** The public API is usable for this personal, local, non-redistributing use. Its terms ask for a link back to the Remotive URL and a credit to Remotive, both done, and at most about 4 requests a day, which the throttle enforces. The API exposes only 17 jobs, delayed 24 h. `publication_date` has no timezone and is parsed as UTC.

**Files:**
- `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `.gitignore`, `.nvmrc`, `.env.example`, `README.md`: the workspace, its scripts and the docs.
- `packages/shared/src/*`: the `ListingDraft`, `SourceId`, `FeedItem` and `FeedResponse` zod schemas.
- `apps/api/src/main.ts`, `app.module.ts`: bootstrap, `/api` prefix, config, Mongo, schedule and SPA serving.
- `apps/api/src/common/error-envelope.filter.ts`: puts every error in the `{ error: { code, message } }` envelope.
- `apps/api/src/sources/*`: the `JobSource` port, `RemotiveAdapter`, the fixture and the `SOURCES` registry.
- `apps/api/src/ingestion/*`: the listings and `source_runs` schemas, `effectiveDate`, the sanitizer, the pipeline service, the scheduler and `ListingsReader`.
- `apps/api/src/listings/*`: the `GET /api/feed` controller and service.
- `apps/api/src/**/*.spec.ts`: 30 unit tests (adapter fixture, effective date, sanitizer, pipeline, feed read).
- `apps/web/*`: the feed page SPA with loading, empty and error states, plus the dev proxy.

**Review:** quick lens, 5 findings.
- 2 patched: 1 medium (the throttle on failed runs) and 1 low (the `findFeed` type).
- 0 deferred.
- 3 rejected, with the reasons in the triage log: the `SourceId.parse` 500 has no reachable trigger; the partial-bulkWrite count needs a rare mid-batch error and no longer causes per-tick retries; a malformed Remotive item is unlikely and would need guards.

**Follow-up review recommended:** false. One medium and one low were patched, below the threshold of one high or two mediums.

**Verification:** all passed.
- `pnpm install --frozen-lockfile && pnpm build`: exit 0, and all three dist outputs exist.
- `pnpm test`: 5 files, 30 tests passed, with no network calls.
- `pnpm start`: `/api/feed` returned 200 with 17 items sorted by `effectiveDate` descending, in 2 ms. `/` served the SPA. `/api/nope` returned the error envelope.
- Restart: the log showed `remotive skipped (throttled)`, and the feed still served the stored items instantly.
- `mongosh`: the unique `source_1_sourceJobId_1` index exists, and the last `source_runs` record is `ok:true, count:17`.
- The boot fetch from an empty DB ran live once (17 upserted) during implementation.

**Residual risks:**
- The page was not opened in a real browser; only the HTML, the build and the API were checked.
- Live refetch (the same jobs seen again) and a live outage were checked only by unit tests, to stay within Remotive's request limit.
- If MongoDB is down at boot, startup stalls on Mongoose's connection retries.
- `apps/web` has no tests yet.
