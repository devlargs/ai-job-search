---
type: architecture-review
lens: adversary
target: _bmad-output/initiative-ai-job-search-v1/architecture-ai-job-search-v1/architecture-ai-job-search-v1.md
ticket: _bmad-output/initiative-ai-job-search-v1/initiative-ai-job-search-v1.md
created: '2026-11-27'
---

# Adversarial Review: AI Job Search v1 Architecture Spine

## Verdict

**Not build-safe yet.** The spine is good at the process and write-path level (AD-1, AD-3 and AD-5 close the obvious "second writer" and "bulk Claude" holes). But it leaves the **identity of shared data** undefined in four places: resume item ids across re-upload and edit, `SkillId` vs. resume skill items, the `ListingDraft` shape, and upsert-on-refetch semantics. It also leaves the **behaviour of the feed when its inputs are missing** undefined: no confirmed resume, listings with no extracted skills, an empty preference. Two stories can each obey every AD and still ship code that does not fit together. 19 holes were found: 4 critical, 7 high, 8 medium.

## Method

For each hole there is a pair of units one level below the spine (an epic story, an adapter, a module, or web vs. api). Each unit is built to obey every AD literally. The section then shows where the two builds clash and gives the AD rule (new or tightened) that makes the clash impossible. "Story F-x" means a job feed epic story. "Story R-x" means a resume tailoring epic story.

Severity:
- **Critical:** silent wrong output or data loss on the tracer path.
- **High:** integration break or a requirement violated in normal use.
- **Medium:** divergence in edge cases, or rework.

---

## Critical

### H1. Re-upload and post-confirm edits orphan tailored resumes. The tailored structure cannot render on its own.

- **Pair:** Story R-2 "re-upload master resume" vs. Story R-5 "download tailored PDF".
- **R-2, per AD-6:** a re-upload *replaces* `master_resume` with a new `draft`. The parse mints fresh nanoid item ids (Conventions: "created at parse"). R-2 also lets the user delete or rewrite bullets after confirmation, and the resume stays `confirmed`.
- **R-5, per AD-7:** renders the PDF "from this structure". The stored structure holds only `{ id, bullets: [{ sourceBulletId, text }] }`. It has no company, title, dates or project names, so the renderer has to **join live to the current master** to get them.
- **Clash:** after a re-upload, every stored `tailored_resume` points at ids that no longer exist. The join yields empty sections or throws. After a post-confirm edit (a deleted experience, or a bullet whose number changed), an old tailored PDF re-renders with facts that no longer match what AD-7 validated. That breaks C4's "every claim traces to the master" after the fact. Each story obeys every AD.
- **Race variant (concurrent Claude calls):** a tailor request is queued behind a parse in the AD-5 serial queue. A re-upload lands while it waits. The tailor result is then validated against whatever master is loaded at save time: a different id set, now `draft`. Validator A loads the master at request time. Validator B loads it at save time. Both are AD-compliant.
- **Fix: new AD-6a "Master resume is versioned; tailored resumes are frozen snapshots".**
  - `master_resume` carries `version: int`. It increments on every confirm and on every edit after confirm.
  - Re-upload writes a **separate** `draft` slot and does not touch the confirmed resume. The confirmed resume keeps serving matching and tailoring until the new draft is confirmed. On confirm, the draft atomically replaces the confirmed resume and `version` increments.
  - A tailoring request reads the master once and records `masterVersion`. It validates against that same snapshot. It saves only if `master.version === masterVersion`, otherwise it returns `409 resume_changed`.
  - `tailored_resume` stores a **fully denormalized render model**: company, title, dates and project names copied in at save time, plus `masterVersion`. The PDF renders from the tailored document alone and never joins to the master.
  - The API marks a tailored resume `stale: true` when `masterVersion < master.version`. The UI shows a "re-tailor" prompt. Stale PDFs stay downloadable as they were validated.

### H2. "Skills" has three incompatible identities.

- **Pair:** Story F-4 "match score" (in `listings`) vs. Story R-1 "parse master resume" (in `resume`).
- **AD-4:** `matchScore(jobSkills, resumeSkills)` takes `SkillId[]`, the canonical ids from `skills.json`.
- **AD-7:** "every master resume item (… skill) has a stable `id`". That id is a nanoid. Yet `skillOrder: SkillId[]`, and the validator rejects "any `id` … not in the master".
- **R-1, literally:** stores skills as `{ id: nanoid, name: "React.js" }`.
- **F-4, literally:** builds `resumeSkills` one of three ways, all defensible:
  - (a) `extractSkills` over the skills section only;
  - (b) `extractSkills` over the whole resume text, so "React" in a bullet counts;
  - (c) it expects R-1 to have stored `SkillId`s already.
- **The truth check has a gap of its own.** "`extractSkills(text)` finds a skill not in the master's skills" checks the tailored text against *which* master skill set: the skills section, or the whole resume? A skill missing from `skills.json` (the user lists "Svelte", which is not in the dictionary yet) is invisible to scoring **and** to the C4 guard. Claude can then invent any skill not in the dictionary and it passes.
- **Listing side:** "the job's `skills`" means `extractSkills` over title only, description only, or both? The F-2 adapter story and the F-3 pipeline story can disagree.
- **Fix: tighten AD-4 and AD-7 with "Skill identity".**
  - Each resume skill item is `{ id: nanoid, label: string, skillId: SkillId | null }`. `skillId` is resolved through `skills.json` when the resume is saved.
  - `resumeSkills` = the distinct non-null `skillId`s of the **skills section** plus `extractSkills` over experience and project bullets. This is computed in one function, `matching.resumeSkillSet(master)`.
  - Listing skills = `extractSkills(title + " " + descriptionText)`.
  - `skillOrder` holds master **skill item ids**, not `SkillId`s.
  - The truth check also rejects any tailored text containing a master-absent **label** in the skills list. Any skill token in the summary or bullets must appear in the dictionary set or in the master's `label`s.
  - Unresolved labels (`skillId: null`) are listed in the review UI so the user can add synonyms.

### H3. `ListingDraft` and the eligibility input are undefined, so adapters and the pipeline disagree on where location lives.

- **Pair:** `remotive.adapter.ts` vs. `onlinejobs-ph.adapter.ts`, with `ingestion` consuming both.
- **AD-2:** names `ListingDraft` but never defines it. AD-4 has `tagEligibility(text)`.
- **Remotive adapter:** the board has a structured `candidate_required_location: "USA Only"`. With no field to put it in, the adapter appends it to `description`.
- **OnlineJobs.ph adapter:** every listing is PH-targeted by nature of the board. AD-2 forbids the adapter from tagging eligibility, so it can't say so. The description rarely says "Philippines", so `tagEligibility(text)` returns `unknown` for the entire board.
- **Himalayas adapter:** gives `locationRestrictions: []`, an empty array meaning worldwide. It is dropped, because `tagEligibility` takes only text.
- **Ingestion** calls `tagEligibility(title)` in one build and `tagEligibility(description)` in another.
- **Precedence is undefined:** what if the text says both "work from anywhere" and "US time zones only / US residents"? Is restricted or worldwide the winner?
- **Fix: new AD-2a "ListingDraft contract".**
  - `ListingDraft` is a zod schema in `packages/shared`: `{ sourceJobId, title, company, url, descriptionHtml (sanitized), descriptionText, locationText: string | null, locationTags: string[], postedAt: Date | null, salaryText?: string }`.
  - `tagEligibility({ source, title, locationText, locationTags, descriptionText })` evaluates rules in a fixed order:
    1. structured `locationTags` and `locationText`;
    2. a per-source default from `eligibility-rules.json` (`onlinejobs-ph → ph-friendly`);
    3. description phrases.
  - **`restricted` beats any positive tag found at the same level.**
  - Description HTML is sanitized in the adapter's normalize step, so the R8 detail view can render it safely.

### H4. The feed has no defined behaviour when its inputs are missing, and AD-6's 409 breaks R2.

- **Pair:** Story F-5 "feed endpoint" vs. Story W-1 "feed page" (web), with Story R-2 "re-upload" as the trigger.
- **F-5, literally per AD-6:** "Matching … use[s] only a `confirmed` resume, and the API returns `409 resume_not_confirmed` otherwise." So `GET /api/feed` returns 409 on first run (no resume yet), and again after every re-upload until the user re-confirms.
- **W-1:** expects R2's "opening the app shows stored listings without waiting". It renders an error page.
- **Listings with no extracted skills:** HTML sources and short RSS entries often have none. `matchScore([], x)` might be `0`, so every such listing is dropped by `minMatch 40`. Or it might be `NaN`, which sorts unpredictably, or `100`. All three are "pure functions returning 0..100".
- **Fix: tighten AD-4 with "Feed without full inputs".**
  - With no confirmed resume, the feed still returns eligible, preference-filtered listings grouped by tier. Every `score` is `null`, ordering is by `effectiveDate` descending, `minMatch` is not applied, and the response includes `scoring: "no_resume"`. The 409 applies **only** to tailoring.
  - `matchScore` with empty `jobSkills` returns `null` ("unscored"). Unscored listings are never dropped by `minMatch`. They sort after scored listings in their tier and carry a badge.
  - With H1's separate draft slot, re-upload never takes scoring offline.

---

## High

### H5. Upsert-on-refetch semantics are undefined: tiers jump and stored tags go stale.

- **Pair:** Story F-3 "ingestion pipeline" vs. Story F-6 "add synonyms and eligibility phrases" (the Deferred section says the data files "grow with use").
- **F-3, literally per AD-3:** on refetch, the upsert overwrites everything except `firstSeenAt`, including `postedAt` and therefore `effectiveDate`. That is one valid reading. The other is `$setOnInsert` for everything. Under the first reading:
  - a board that bumps or reposts `postedAt` (RemoteOK does this) moves a 20-day-old listing back into `<24h`;
  - a board that stops returning `postedAt` flips the listing to `firstSeenAt`.
- **F-6** edits `skills.json`. Eligibility and skills are "stored at ingest", so every listing no longer in a source's current window keeps its old tags forever. A newly added "US only" phrase never hides old restricted listings, and that breaks R3's "never restricted".
- **Fix: tighten AD-3.**
  - The upsert is a single atomic `updateOne(..., { upsert: true })`. It uses `$setOnInsert: { firstSeenAt, effectiveDate }` and `$set` for content fields and `lastSeenAt`.
  - **`effectiveDate` is computed once, at insert, and is immutable.** `postedAt` updates are stored but never move the tier.
  - Each listing stores `rulesHash` (a hash of the two data files). At boot and before each run, ingestion re-derives `eligibility` and `skills` for every listing whose `rulesHash` is not current. This is still ingestion as the only writer.

### H6. Scheduler run lifecycle: overlap, boot and `since` all have no owner.

- **Pair:** Story F-3 "pipeline" vs. Story F-7 "scheduler wiring".
- **Overlapping runs:** F-7 uses `@Interval(30min)`. A slow HTML source makes one run take more than 30 minutes, and two runs then upsert the same keys concurrently. Two inserts race on the unique index and one gets E11000. F-3's "log and continue" counts that as a source failure.
- **Boot:** neither story runs a fetch at boot. The app opens after a night off with listings 10 hours old, which breaks "Done when: refreshed within the last 30 minutes".
- **`since`:** `JobSource.fetch(since?)` needs a per-source `lastSuccessAt`. Adapters can't persist (AD-2) and no collection exists. One build keeps it in memory, so it is lost at restart. Another never passes it.
- **Fix: tighten AD-1 and AD-3.**
  - Ingestion owns a `source_runs` collection: `{ source, lastStartedAt, lastSuccessAt, counts, error }`.
  - A run fires at boot and then every `FETCH_INTERVAL_MIN`. A run that finds the previous run still active is skipped and logged.
  - Sources are fetched sequentially within a run, or with bounded concurrency.
  - E11000 during upsert is retried once as an update.
  - `since` = that source's `lastSuccessAt`.

### H7. Truth-check tokenization is ambiguous, and the summary is unchecked.

- **Pair:** Story R-3 "tailor endpoint plus AD-7 validator" vs. Story R-4 "tailoring prompt/schema".
- **Numbers:** "a bullet contains a number absent from its source bullet". Validator A tokenizes `\d+`, so "1,000" becomes `1` and `000`, and "5+" passes as "5". Validator B normalizes "1k", "1,000" and "1000" to one value. Is "Q3" a number? Is "2019"? Are "two" and "2" the same? The prompt author in R-4 can't know which rewrites will be rejected.
- **Summary:** the number and skill checks speak of "bullet" and "`text`". The `summary` is free text and checked by neither, so "10+ years of experience" passes.
- **Structure:** a `sourceBulletId` from experience A can be placed under experience B, or used twice. Both pass "id is in the master".
- **Fix: tighten AD-7.**
  - Number tokens are extracted by one exported function, `matching.numberTokens(text)`. Its normalization (thousands separators, `k`/`m` suffixes, `%`, `+`, spelled-out numbers up to twenty, years) is fixed by unit tests.
  - Summary numbers must appear somewhere in the master.
  - Summary skills must be in the master skill set (H2).
  - Every `sourceBulletId` must belong to its enclosing experience or project and appear at most once.
  - `projects` gets the same shape as `experiences`. Its `[...]` in AD-7 is currently undefined.

### H8. Item ids: Claude, server or browser could each mint them.

- **Pair:** Story R-1 "parse" (gateway schema) vs. Story W-3 "master resume review/edit form" (web).
- **R-1:** "ids … created at parse". Builder A puts `id` in the Claude output schema, so Claude invents the ids: unstable and maybe duplicated. Builder B mints them on the server after parse. AD-8 then has to cover two different schemas, the Claude output without ids and the stored resume with ids. It names only one.
- **W-3:** the user adds a bullet during review. The web form mints a client nanoid, or sends one without an id. The API either keeps the client id or rejects the bullet.
- **Edit endpoint:** `PUT /api/resume` replaces the whole document in one build. A `PATCH` per item works in another. A full replace that re-mints ids silently breaks H1's references even when nothing was deleted.
- **Fix: tighten AD-6, AD-8 and the Conventions.**
  - Claude output schemas are separate zod schemas (`ResumeParseOutput`, `TailorOutput`) and hold no master ids, except `TailorOutput`, which echoes ids it was given.
  - **Only the server mints item ids.** Items sent without an id get one. Items sent with an id keep it. An unknown id is a 400.
  - Edits use `PUT /api/resume` with the full document. Ids are preserved by this rule.

### H9. Preference matching semantics have three valid readings.

- **Pair:** Story F-8 "preference settings" vs. Story F-5 "feed query".
- **Keyword types:** "React" is both a role word and a `SkillId` synonym. Does it match title, skills, or either?
- **Multiple keywords:** "Frontend, ReactJS" could combine with AND or OR.
- **Matching style:** "Java" as a raw substring matches "JavaScript Developer".
- **Empty `roleKeywords`:** could show everything or nothing.
- **When resolution happens:** if F-8 resolves keywords to `SkillId`s at save time, it stores a second resolved table (the very thing AD-9 "Prevents"). If F-5 resolves at read time, the two stories can still disagree on the result.
- **Fix: tighten AD-9.**
  - The document stores the raw keywords. Resolution happens at read time in `matching.resolvePreference(keywords)`.
  - A keyword that resolves to a `SkillId` matches when `listing.skills` contains it **or** the title matches the synonym.
  - Other keywords match the title case-insensitively on word boundaries.
  - Keywords are OR'ed.
  - An empty list means no preference filter.
  - `minMatch` is an integer from 0 to 100, compared with `score >= minMatch`.

### H10. The Claude call lifecycle is unspecified: sync vs. async, timeouts and error codes.

- **Pair:** Story R-3 "tailor endpoint" vs. Story W-4 "tailor button" (web).
- **R-3:** holds the HTTP request open until the serialized gateway returns. That can take 60 to 180 s, or longer if the call is queued behind a parse.
- **W-4:** uses `fetch` with a 30 s timeout and retries on failure. The server still finishes the first call, and the retry queues a second Claude call. That is bulk use by accident, which C6 forbids.
- **Error shapes:** a logged-out CLI, a hit subscription limit, a non-zero exit and a timeout each map to different codes in the two stories.
- **Fix: tighten AD-5.**
  - Claude endpoints are **async**. `POST` returns `202 { jobId }`, and the web polls `GET /api/claude-jobs/:id` (`queued | running | done | failed`).
  - Within the serialized queue, a request with the same `(kind, listingId)` is deduped to the existing job.
  - Each call has a 180 s timeout and its child process is killed on timeout.
  - The gateway error codes are fixed: `claude_unavailable`, `claude_limit_reached`, `claude_timeout`, `claude_invalid_output`.

### H11. Two owners of the `listings` model, and Mongoose schemas outside the contract.

- **Pair:** the `ingestion` module vs. the `listings` module.
- **The conflict:** both need a Mongoose schema for `listings`. AD-3 says only ingestion writes. The Structural Seed gives `listings/` the feed query. Each module defines its own `@Schema()` class, and the two drift. For example, ingestion stores `eligibility: "ph-friendly"` while listings filters `"ph_friendly"`, or one writes `sourceJobId` and the other reads `externalId`.
- **Why AD-8 misses it:** AD-8 binds web↔api shapes only. Persistence shapes are not in the contract.
- **Fix: tighten AD-8 and AD-3.**
  - Enums (`Eligibility`, `SourceId`, tiers, resume status) and persisted document shapes are zod schemas in `packages/shared`.
  - Each collection has **one** Mongoose schema file, owned by its writing module (`ingestion/listing.schema.ts`, `resume/*.schema.ts`). It is typed from the shared type.
  - Readers import that file and get a read-only repository with no write methods.

---

## Medium

### H12. effectiveDate edge cases

- **Pair:** `we-work-remotely.adapter.ts` (RSS) vs. a future HTML adapter (Jobstreet or Kalibrr).
- **Clash:**
  - RSS `pubDate` carries a timezone offset.
  - Jobstreet shows "3d ago". The adapter turns that into `now - 3d` on every fetch, so `postedAt` drifts on each run (made worse by H5).
  - A date-only `"2026-11-27"` is UTC midnight in one adapter and Manila midnight in another, which moves the 24h boundary by 8 hours.
  - "Not in the future" is undefined: no clock-skew tolerance, and was it checked at ingest or at read time?
  - On first run, every listing with a missing `postedAt` gets `firstSeenAt = now`. The first run then floods `<24h` with weeks-old jobs.
- **Fix: tighten AD-3 and AD-2a.**
  - Adapters emit `postedAt` only from an absolute timestamp. Relative strings ("3d ago") and date-only values are emitted as `postedAt: null` plus `postedAtApprox`, which is never used for `effectiveDate`.
  - "Future" means `> firstSeenAt + 5 min`, checked once at insert.
  - On a source's **first successful run** (`source_runs` empty), listings with no reliable `postedAt` get `effectiveDate = firstSeenAt - 7d`, which puts them in "older".

### H13. Tier boundaries and the clock: web vs. api

- **Pair:** Story F-5 "feed endpoint" vs. Story W-1 "feed page".
- **Clash:**
  - The API returns a flat list and W-1 groups it in local time. Or the API returns groups and W-1 re-sorts them.
  - Is exactly 24h in "<24h" or in "1–3d"? Is 72h in "1–3d" or in "older"?
  - Ties in score have no rule, so the order flickers between refreshes.
- **Fix: tighten AD-4.**
  - The API computes tiers with server `now`: `<24h` is `age < 24h`, `1–3d` is `24h <= age < 72h`, and older is the rest.
  - The API returns `{ tiers: [{ tier, listings }] }`, and the web never re-groups.
  - Tie-break is `score desc`, then `effectiveDate desc`, then `_id`.
  - No pagination in v1, but each tier is capped at N = 200 and the response says so.

### H14. Cross-source duplicates

- **Pair:** `remotive.adapter.ts` vs. `himalayas.adapter.ts`. The same posting is syndicated to both.
- **Clash:** the upsert key `(source, sourceJobId)` creates two listings. AD-3's "Prevents: duplicate listings" only covers duplicates within one source. A later feed story might dedupe by title and company, and a tailoring story might key on the listing that was then hidden.
- **Fix: tighten AD-3.** Either state that cross-source duplicates are shown in v1, or define `dupeKey = normalize(company) + normalize(title)` stored at ingest. The feed then shows the earliest `effectiveDate` per `dupeKey` and lists the others as alternate apply links. `tailored_resume` stays keyed by `listingId`.

### H15. Listing retention and closed postings

- **Pair:** `ingestion` vs. `resume` (a `tailored_resume` keyed by `listingId`).
- **Clash:** nothing says listings are never deleted. A clean-up story ("drop listings older than 30d") is AD-compliant because ingestion is the writer, and it orphans tailored resumes. Postings that are filled stay in "older" forever.
- **Fix: tighten AD-3.** Listings are never deleted in v1. `lastSeenAt` is updated each run. A listing not seen for 14 days is marked `closed: true` and hidden from the feed, but it stays readable for its tailored resume.

### H16. Tailored resume vs. a changed listing

- **Pair:** `ingestion` (re-fetch updates the description) vs. `resume` (an existing tailored resume).
- **Clash:** the job description changes after tailoring. Nothing records which version of the description was tailored against.
- **Fix: extend AD-6a.** `tailored_resume` stores `listingContentHash`. The UI flags a stale tailoring when the hash differs.

### H17. The JSON Schema generated from zod loses refinements

- **Pair:** `packages/shared` schema author vs. the `claude` gateway.
- **Clash:**
  - zod refinements, transforms and `.default()` either do not translate through `z.toJSONSchema` or translate differently in input and output mode.
  - `--json-schema` then accepts output that the zod parse rejects. That is a retry loop or a hard error the user can't fix.
  - Dates sent as strings vs. a zod `Date` is the same split.
- **Fix: tighten AD-8.** Claude output schemas use only JSON-Schema-representable zod (no `.transform`, `.refine` or `Date`). A unit test asserts that `z.toJSONSchema(schema)` round-trips a fixture.

### H18. Eligibility "unknown" vs. a confirmed restriction elsewhere

- **Pair:** `matching/data/eligibility-rules.json` author vs. Story F-5 "feed filter".
- **Clash:** a rule-file edit adds a new label (for example `americas`), and the feed filter's hard-coded allowlist silently hides it, or shows it.
- **Fix: tighten AD-4.** `Eligibility` is a closed zod enum in `packages/shared` (`worldwide | apac | ph-friendly | restricted | unknown`). The rules file is validated against it at boot, and the feed allowlist is a named exported constant.

### H19. Source registration has no mechanism

- **Pair:** Story F-1 "source spike" vs. Story F-2 "adapters".
- **Clash:** "registered only after the source spike marks it usable" is enforced by a code-level provider array in one build, an env list in another, and a `sources` collection in a third. R1's "listings from every verified source" can't be checked without one registry.
- **Fix: tighten AD-2.** One `sources/source-registry.ts` exports `ENABLED_SOURCES: SourceId[]`. It is edited by the spike outcome, and the `SourceId` enum lives in `packages/shared`. Per-source status is shown from `source_runs` (H6).

---

## Summary of proposed rule changes

| # | Severity | Change |
| --- | --- | --- |
| H1 | Critical | New AD-6a: master `version`; separate draft slot; tailoring snapshot plus conditional save; tailored resume stored as a denormalized render model with `masterVersion`; stale flag |
| H2 | Critical | Skill item `{id, label, skillId\|null}`; one `resumeSkillSet()`; `skillOrder` uses item ids; truth check covers labels and the summary |
| H3 | Critical | New AD-2a: `ListingDraft` zod schema; structured location input; per-source eligibility defaults; restricted wins; sanitized HTML |
| H4 | Critical | Feed works without a confirmed resume (`score: null`); empty job skills give `null`, never dropped; 409 only for tailoring |
| H5 | High | Atomic upsert with `$setOnInsert`; immutable `effectiveDate`; `rulesHash` re-derivation by ingestion |
| H6 | High | `source_runs` collection; run at boot; no overlapping runs; `since = lastSuccessAt` |
| H7 | High | One `numberTokens()`; summary checked; `sourceBulletId` scoped to its parent and used at most once; `projects` shape defined |
| H8 | High | Only the server mints item ids; separate Claude output schemas; full-document `PUT` that preserves ids |
| H9 | High | Preference: read-time resolution, OR semantics, word-boundary title match, empty means no filter |
| H10 | High | Async Claude jobs (202 plus poll), dedupe, 180 s timeout, fixed error codes |
| H11 | High | Persisted shapes and enums in `shared`; one Mongoose schema per collection, owned by its writer |
| H12 | Medium | Absolute timestamps only; future check with tolerance at insert; first-run backdating |
| H13 | Medium | Server computes tiers with half-open bounds; tie-break; per-tier cap |
| H14 | Medium | Declare the cross-source duplicate policy (`dupeKey`) |
| H15 | Medium | Never delete listings; `lastSeenAt` and `closed` |
| H16 | Medium | `listingContentHash` on the tailored resume |
| H17 | Medium | Claude schemas restricted to JSON-Schema-safe zod, with a round-trip test |
| H18 | Medium | Closed `Eligibility` enum; rules file validated at boot |
| H19 | Medium | One `source-registry.ts` with `ENABLED_SOURCES` |
