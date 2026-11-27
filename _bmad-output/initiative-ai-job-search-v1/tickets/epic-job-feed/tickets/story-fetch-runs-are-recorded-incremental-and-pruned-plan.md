---
title: 'Fetch runs are recorded, incremental and pruned'
type: feature
ticket: '4'
created: '2026-11-27'
status: built
baseline_revision: 'c140b0377de1155bbce04f0c903baa14cf24cac2'
route: oneshot
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
      Pruning by lastSeenAt will delete still-posted listings once an adapter honors `since` and stops returning older jobs.
    evidence: |-
      lastSeenAt is refreshed only for listings an adapter returns. Remotive ignores since, so nothing is lost today, but story 1.9's
      Himalayas (cursor paging that stops at since) and Jobicy adapters would stop returning older open jobs, and pruneStale would
      delete them after RETENTION_DAYS. Story 1.9 must either fetch a full first page/window each run or refresh lastSeenAt another way.
    location: >-
      apps/api/src/ingestion/ingestion.service.ts pruneStale
    severity: medium
---

<intent-contract>

## Intent

**Problem:** AD-1/AD-3 runs must leave one `source_runs` record per source per run, fetch incrementally from `lastSuccessAt`, isolate a failing adapter, log one summary line, and delete listings whose `lastSeenAt` is older than `RETENTION_DAYS` (default 30). Story 1.1 already built the record, `since`, isolation and summary line. Two things are missing: no listing is ever pruned, and a throttled source writes no record.

**Approach:**
- At the end of every run that is not skipped, delete listings with `lastSeenAt < now − RETENTION_DAYS` and add the deleted count to the summary line. `RETENTION_DAYS` comes from `.env` through `@nestjs/config`, default 30; an invalid or non-positive value falls back to 30.
- A throttled source writes a `source_runs` record `{ ok: false, throttled: true, count: 0, error: null }`. The throttle lookup ignores throttled records, so they never extend the window, and the `since` lookup already reads only `ok: true` records.
- Tests cover each verify clause with two fake sources, one of which throws.

</intent-contract>

## Implementation Notes

Oneshot route: the change is about 60 lines across `ingestion.service.ts`, `source-run.schema.ts`, `.env.example` and the spec. Story 1.1 already built the rest of this story.

- A throttled tick writes `{ ok: false, throttled: true }`. The throttle lookup filters `throttled: { $ne: true }`, and the `since` lookup still reads `ok: true` only.
- `RETENTION_DAYS` is read through an `@Optional()` `ConfigService` on `IngestionService`, so the specs construct the service with 4 arguments and get the default 30.
- Review patch: `pruneStale` also deletes throttled `source_runs` records older than a day, so the table stays bounded at about 48 throttled records per source.

## Plan Change Log

## Review Triage Log

### 2026-11-27 — Review pass
- verdicts: 7 findings — high 0, medium 2, low 5, false 0, maybe-false 0
- findings:
  - `[low]` `[patch]` The prune test's cutoff bounds were reversed and timing-sensitive — now `> 10d − 1 s` and `≤ 10d`.
  - `[low]` `[patch]` "logs a failed prune" asserted no log — renamed, and it now asserts the error log and "pruned failed" in the summary.
  - `[low]` `[patch]` No test on the summary log line — added a test for the failing source's error, the ok source and "pruned 3" in one line.
  - `[medium]` `[patch]` Throttled records made `source_runs` grow each tick, and the `$ne` lookup can't use the index — throttled records older than a day are now deleted at prune, which bounds the table; test added.
  - `[low]` `[patch]` The throttle comment said "any outcome" — reworded to "latest attempted run".
  - `[low]` `[reject]` Throttled records are stored as `ok: false` — no reader is affected (`since` reads `ok: true`, nothing else queries `source_runs`); changing it means a schema change for no named harm.
  - `[medium]` `[defer]` Pruning will delete still-posted listings once an adapter honors `since` — not reachable today (Remotive ignores `since`); recorded in `deferred` for story 1.9.

## Verification

**Commands:**
- `pnpm build && pnpm test` -- expected: exit 0. New specs pass: pruning deletes rows by `lastSeenAt` cutoff and reports the count; a throttled source writes one `throttled: true` record that does not extend the window; with one source throwing, the other source still upserts and both get a record.
- `pnpm start`, then `mongosh ai-job-search --quiet --eval 'db.source_runs.find().sort({startedAt:-1}).limit(1)'` -- expected: the boot run wrote a Remotive record (`throttled: true` while within 360 min). The summary log line includes `pruned N`.
- Age one listing (`db.listings.updateOne({}, {$set:{lastSeenAt: new Date(Date.now()-31*864e5)}})`) and restart -- expected: that listing is gone after the boot run.

## Auto Run Result

**Summary:**
- At the end of every run that isn't skipped, listings with `lastSeenAt` older than `RETENTION_DAYS` (default 30, set in `.env`) are deleted. The count appears in the summary line, and a failed delete is logged without failing the run.
- A throttled source now writes a `throttled: true` `source_runs` record, giving one record per source per run (AD-3). Throttled records never extend the throttle window and are cleaned up after a day.
- Story 1.1 already provided `since = lastSuccessAt`, adapter isolation and the summary line. The new tests now pin each part of this ticket's verify clause.

**Files:**
- `apps/api/src/ingestion/ingestion.service.ts`: retention pruning, throttled records, and the bounded cleanup of `source_runs`.
- `apps/api/src/ingestion/source-run.schema.ts`: the `throttled` flag.
- `apps/api/src/ingestion/ingestion.service.spec.ts`: tests for pruning, the default retention, throttled records, records per run, the summary line and the cleanup.
- `.env.example`: `RETENTION_DAYS`.

**Review:** quick lens, 7 findings.
- 5 patched: 1 medium and 4 low.
- 1 deferred (medium): story 1.9's `since` adapters versus pruning.
- 1 rejected: throttled records stored as `ok: false`, which affects no reader.

**Follow-up review recommended:** false. Only one medium was patched.

**Verification:**
- `pnpm build` passes, and `pnpm test` passes 68 tests.
- Live: a throttled boot wrote a `throttled: true` record, and the summary line shows `pruned N`. A listing aged 31 days was deleted on the next boot (17 → 16 listings).

**Residual risk:** the deferred `since`-versus-pruning interaction. Story 1.9 must handle it.

