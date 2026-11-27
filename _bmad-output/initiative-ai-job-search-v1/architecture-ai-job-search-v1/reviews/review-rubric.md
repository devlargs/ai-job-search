# Rubric Review: Architecture Spine, AI Job Search v1

- Spine: `architecture-ai-job-search-v1.md` (draft, 2026-11-27)
- Ticket: `initiative-ai-job-search-v1.md`
- Reviewer stance: checklist review, no rewrite of the spine.

## Verdict

**Revise before handing to epics.** The paradigm, the single-writer rules, the Claude gateway and the truth-enforcement idea are sound, and most of R1 to R13 are placed. But four cross-epic seams are left open: the listing record shape, what the feed does with no confirmed resume, holes in tailoring validation, and stale stored tags. The operational envelope has gaps around the scheduler, the Claude process and data lifecycle. C7 is listed under `binds` but nothing governs it.

## Checklist results

| Check | Result | Notes |
| --- | --- | --- |
| Fixes the real divergence points between the two epics, misses none | Partial | Misses the `ListingDraft`/`Listing` shape (F1), the feed with no confirmed resume (F2), how resume skills are canonicalized (F4), and UI conventions shared by both epics (F9) |
| Every AD Rule is enforceable and prevents its divergence | Partial | AD-7 leaves `summary`, `skillOrder` and `projects` unchecked (F3). AD-3's stated "prevents duplicate listings" covers only within-source duplicates (F7). AD-4's "prevents stale scores" does not cover stale stored tags (F4). AD-5 is missing a timeout and env hygiene (F5) |
| Nothing under Deferred lets units diverge | Partial | "Exact phrases and synonyms grow with use" causes stale tags without a re-tag rule (F4). "UI library: one builder" is wrong because both epics ship UI (F9). "Backups: re-parse" loses R10 corrections (F10) |
| Covers R1 to R13 and C1 to C7 | Partial | R3's unknown badge and R8's description and apply link depend on undefined fields (F1). C7 is not governed (F8). C2 has an env leak risk (F5) |
| Every dimension the altitude owns is decided, deferred or an open question | Partial | Environments and running are decided. Operations are not: fetch on boot, overlapping runs, retention, source health, Claude failure modes and Mongo indexes (F5, F6) |

## Findings

### F1: High. Listing contract undefined, adapters and web will diverge (R1, R3, R8)

AD-2 requires every adapter to return `ListingDraft`, but no AD defines its fields. Each adapter story will choose its own `title`, `company`, `location` text, `description` format (raw HTML from RSS, plain text from APIs, scraped HTML), `url`, `postedAt` and `sourceJobId`. The R8 row of the capability map says only "AD-8 (listing keeps `url`)", and no rule says so. `tagEligibility(text)` does not say which text it reads, so eligibility quality will depend on how each adapter fills location. The R3 badge needs `eligibility` on the feed DTO, and no rule puts it there. Rendering a full description as HTML is also an XSS risk.

**Fix:** Add an AD (or extend AD-2/AD-8) that pins `ListingDraftSchema` in `packages/shared`: `{ source: SourceId, sourceJobId: string, title, company, locationText: string|null, descriptionHtml: string /* sanitized at normalize */, url: string /* original posting, required */, postedAt: Date|null }`. Also pin the `Eligibility` enum (`worldwide|apac|ph-friendly|restricted|unknown`) there, and add a `FeedItem` that carries `eligibility`, `score`, `tier` and `url`. State that `tagEligibility` reads `title + locationText + description`, and that sanitization happens once in `normalize` and nowhere in adapters or web.

### F2: High. Feed behavior with no confirmed master resume undefined (R2, R4, R13; cross-epic)

AD-4 computes scores against the confirmed resume. AD-6 says matching returns `409 resume_not_confirmed` otherwise. Read together, the feed is unusable until the Resume epic ships and the user has confirmed a resume. That conflicts with Done-when ("Opening the app shows, without waiting, a feed") and with building the Job feed epic independently. Each epic will improvise a different fallback.

**Fix:** Add a rule: with no confirmed resume, `GET /api/feed` returns 200 with `score: null`, applies eligibility and preference filters but skips the `minMatch` filter, sorts each tier by `effectiveDate` descending, and sets a `resumeStatus` field so the UI shows a "confirm your resume to rank" banner. Limit the 409 to tailoring.

### F3: High. AD-7 truth checks leave holes (C4, R11)

The checks cover experience ids, bullet `sourceBulletId`, skills found in bullet text and numbers in bullets. Unchecked: `summary`, which is free text and could invent "8 years" or unlisted skills; `skillOrder`, which is not required to be a subset of master skills; and `projects: [...]`, whose shape is not specified. There is also no defined rejection response and no retry rule. A silent auto-retry would multiply Claude calls and break C6.

**Fix:** Apply `extractSkills` and the number check to `summary` against the whole master text. Require `skillOrder ⊆ master.skills`. Spell out the `projects` shape the same way as `experiences`. Define the rejection as `422 tailoring_rejected` with `{ violations[] }`, with no automatic retry, so the user re-clicks.

### F4: Medium. Stored tags go stale, skill canonicalization unowned (R3, R13, C3)

AD-4 stores `eligibility` and `skills` at ingest, while Deferred says the rule and synonym files "grow with use". Listings tagged before a rule change keep their old tags, and nothing re-tags them. This is the staleness AD-4 claims to prevent, moved one step back. The AD-3 pipeline also omits `extractSkills` even though AD-4 says skills are stored at ingest. Separately, `matchScore(jobSkills, resumeSkills)` and AD-7 assume master resume skills are `SkillId`s, but Claude parses free-text skills. No rule says who maps them, so a skill missing from `skills.json` drops silently and scores 0.

**Fix:** Add `extractSkills` to the AD-3 pipeline. Store a `rulesVersion` (hash of both JSON files) on each listing. On startup, if the hash differs, `ingestion` (still the only writer) re-runs the pure taggers over all listings. State that the master resume's skills are canonicalized through `skills.json` on save or confirm. Show unmapped skills in the R10 review screen so the user can see they will not count.

### F5: Medium. Claude gateway operational gaps (C2, C6, R9, R11)

- No timeout. A hung `claude -p` blocks the serialized queue forever.
- No mapping for "binary missing", "not signed in" or "subscription limit hit" to error codes. Both epics' UIs need these.
- C2 risk: if `ANTHROPIC_API_KEY` is set in the user's shell, the CLI will use it, and that is paid. The spawn env is not specified.
- `--output-format json` wraps the result in an envelope. Which field is zod-parsed is not specified, and `--json-schema` / `--tools ""` support in CLI 2.1.332 is assumed, not verified.

**Fix:** In AD-5, add a timeout (for example 120s, then kill, then `504 claude_timeout`), plus `503 claude_unavailable` and `429 claude_limit`. Spawn with `ANTHROPIC_API_KEY` removed from the env. Name the envelope field that is parsed. Add a one-hour gateway spike to confirm the flags before AD-6 and AD-7 stories start.

### F6: Medium. Scheduler and data lifecycle not decided (R2, operations)

- Fetch on boot is not stated. After the app has been closed for days, the "refreshed within the last 30 minutes" Done-when needs an immediate run at startup.
- Overlapping runs: nothing stops a slow run from overlapping the next tick.
- Retention: listings are never pruned or marked closed, so the "older" tier grows without bound and dead postings stay in it.
- Source health: no record of last success per source, so "listings from every verified source" cannot be checked from the app.
- Indexes: only the unique `(source, sourceJobId)` index is named. `effectiveDate` and `eligibility` need indexes for the feed query.
- Politeness: no per-source rate limit or User-Agent rule (C5, ToS).

**Fix:** In AD-1/AD-3, add: run once on boot, then every `FETCH_INTERVAL_MIN`. Use a single-flight guard that skips a tick while a run is active. Keep a `source_runs` record (`{source, at, count, error}`) shown in the UI. Hide or delete listings with `effectiveDate` older than N days (for example 30) and add a `RETENTION_DAYS` config. Index `effectiveDate` and `eligibility`. Each adapter makes at most one request per run per page and sends a fixed generic User-Agent. If `mongod` is down, the app exits at boot with a clear log line.

### F7: Medium. Cross-source duplicates (R1, R4)

AD-3 claims it "prevents duplicate listings", but the key `(source, sourceJobId)` only dedupes within a source. The same role on Remotive, Himalayas and Jobicy will show three times, and that is common across aggregators.

**Fix:** Either narrow the Prevents text and list cross-source dedupe under Deferred with a reason, or add a stored `dedupeKey = normalize(company)+normalize(title)`. The feed then collapses on it, keeps the earliest `effectiveDate`, and lists all source urls.

### F8: Medium. C7 time box not governed

`binds` lists C7, but no AD, map row or Deferred entry addresses it. With 8 sources, 3 of them likely HTML scrapers (OnlineJobs.ph, Jobstreet, Kalibrr), plus PDF parsing and tailoring, the two-week box is the main delivery risk. The spine gives no cut order.

**Fix:** Add a C7 row to the map and a short cut-order note. The tracer path goes first, using one API source (for example Remotive). The remaining API/RSS sources are additive adapters. HTML sources are cut first if the box is threatened. Because AD-2 makes each adapter independent, a cut costs nothing structurally. Note that the capability map has no rows for C1 to C7 in general.

### F9: Low. UI conventions deferred on a false premise

Deferred says "one SPA, one builder", but both epics ship UI: the feed and detail screens, and the resume review, tailor and download screens. They can diverge on routing, data fetching, error display (`{error:{code}}`), and styling library.

**Fix:** Pin a thin convention: one router, one `api.ts` fetch wrapper that parses with the shared zod schemas and surfaces `error.code`, and one styling approach. Or rewrite the Deferred reason to name the builders who will be coordinated.

### F10: Low. Master resume lifecycle edges

- Re-upload creates a new `draft` with new nanoid ids. Existing `tailored_resumes` then reference ids that no longer exist, and the feed loses scoring (with F2's fallback, it degrades gracefully).
- Editing after confirmation (AD-6) can delete items that tailored resumes still reference.
- Deferred "Backups" says the resume "can be re-parsed", but the R10 corrections would be lost.

**Fix:** Mark `tailored_resumes` stale (or delete them) when the master is replaced or a referenced id is removed, and re-validate before rendering the PDF. Add a `pnpm export` that dumps `master_resume` and `preference` to JSON, or change the Deferred reason to accept losing the corrections.

### F11: Low. Minor precision items

- AD-9: AND or OR across `roleKeywords`, case-sensitivity, and the behavior with empty keywords ("show all") are not stated. Two stories will choose differently.
- AD-3 has a `normalize` stage while AD-2 says adapters already normalize. Give each its own job: adapters map fields, `normalize` sanitizes and trims.
- Tier boundaries: the inclusive and exclusive edges of `<24h` and `1–3d`, measured against server `now`, are not stated.
- Stack versions cannot be checked against a lockfile yet. Make sure the scaffold story pins them exactly.

## Coverage matrix

| Item | Covered by | Status |
| --- | --- | --- |
| R1 | AD-2 | OK, shape gap F1 |
| R2 | AD-1, AD-3 | Partial, F6 (boot run, overlap) |
| R3 | AD-3, AD-4 | Partial, enum and badge field F1, staleness F4 |
| R4 | AD-4 | OK, edges F11 |
| R5 | AD-4, AD-9 | OK, no-resume case F2 |
| R6 | AD-3 | OK, rule is precise |
| R7 | AD-9 | Partial, F11 |
| R8 | map row only | Gap, F1 |
| R9 | AD-5, AD-6, AD-10 | OK, gateway ops F5 |
| R10 | AD-6 | OK, unmapped skills F4 |
| R11 | AD-5, AD-7 | Partial, F3 |
| R12 | AD-7 | OK |
| R13 | AD-4, AD-6 | Partial, canonicalization F4, no-resume F2 |
| C1 | AD-1, Stack, env | OK |
| C2 | AD-5, AD-10 | Partial, API key env F5 |
| C3 | AD-4 | OK |
| C4 | AD-7 | Partial, F3 |
| C5 | AD-2 | OK, politeness F6 |
| C6 | AD-5 | OK, retry rule F3 |
| C7 | none | Gap, F8 |

Open questions from the ticket: tech stack (decided), fetch only while running (AD-1 assumption), source usability (deferred to the spike, OK), one preference (AD-9 assumption), tailored kept per job (AD-7 assumption). All five are addressed.
