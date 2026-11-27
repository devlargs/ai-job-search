---
title: 'Which of the other 7 boards can we fetch, and how? (source spike)'
type: chore
ticket: '2'
created: '2026-11-27'
status: built
baseline_revision: '6033d2e4e4e2dbe1574fa90966ef60667b8ef478'
route: oneshot
route_source: auto
risk: high
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/initiative-ai-job-search-v1/architecture-ai-job-search-v1/architecture-ai-job-search-v1.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic R1 needs listings from RemoteOK, We Work Remotely, Himalayas, Jobicy, OnlineJobs.ph, Jobstreet and Kalibrr, and each source must be verified usable before it is relied on. Nobody knows yet which of them can be fetched, in what format, or under what terms, so stories 1.9 and 1.10 cannot be planned.

**Approach:** Probe each board's public feed (API, RSS, or HTML) with a handful of polite requests and read its terms on automated access. For each board, record the feed type, the fields that map to AD-2's `ListingDraft` (especially `postedAt` and location fields), rate limits, terms, a verdict (adopt API/RSS, adopt HTML, or drop) with its reason, and the AD-4 `eligibilityHint`. Save one real fixture payload per adopted board. Time box: half a day. Per C5, prefer API/RSS over HTML; LinkedIn and Indeed stay out. The user signs off on the adopted list (hitl).

</frozen-after-approval>

## Implementation Notes

Oneshot: this spike is research plus saved payloads. It contains no production code, so the coding subagent route doesn't fit.

- Results file: `_bmad-output/initiative-ai-job-search-v1/tickets/epic-job-feed/spike-source-boards/spike-source-boards.md`, with frontmatter `type: spike`, `ticket: '2'` and `container` so that stories 1.9 and 1.10 load it.
- Fixtures: `apps/api/src/sources/adapters/__fixtures__/<source-id>.<json|xml|html>`, matching `remotive.json` on the 1.1 branch. Each is trimmed to about 3–5 items so it stays small. Source ids are kebab-case (`remoteok`, `weworkremotely`, `himalayas`, `jobicy`, `onlinejobs-ph`, `jobstreet`, `kalibrr`).
- `eligibilityHint` values come only from AD-4's set: `worldwide | apac | ph-friendly | restricted | unknown`, or none.
- Requests: send at most a few per board, with User-Agent `ai-job-search-local`.
- Source id for WWR is `we-work-remotely` (the spine's Naming convention), not `weworkremotely` as first written above; the fixture is `we-work-remotely.xml`.
- WWR's terms page returns 403 to automated clients (curl and WebFetch both), so WWR is adopted provisionally and the user reads its terms at sign-off.
- Probed 2026-11-27: one request per feed, plus one `geo=apac` Jobicy request and the terms pages. Jobstreet's listing page returned 403.
- Sign-off (hitl) given by the user on 2026-11-27, adopting WWR after reading its terms in a browser; recorded in the results file.

## Review Triage Log

### 2026-11-27 — Review pass (quick)
- verdicts: 10 findings — high 0, medium 1, low 7, false 2, maybe-false 0
- findings:
  - `[false]` Sign-off missing — the hitl gate is the user's step after review, not a defect in the change; asked at present.
  - `[medium]` `[patch]` WWR adopted with its terms unread, against R1 "verified usable" — verdict changed to "adopt, provisional", settled by the user reading the terms at sign-off.
  - `[low]` `[patch]` Source id `weworkremotely` breaks the spine's `we-work-remotely` example — renamed in the results file and the fixture.
  - `[low]` `[patch]` Jobicy fixture held only restricted cases — swapped in two `geo=apac` items (Australia/NZ, Philippines); the "Anywhere" claim corrected (none seen in 30 items), and Himalayas noted as having no worldwide case.
  - `[low]` `[patch]` Jobicy envelope hand-edited (`jobCount: 4`) — restored as served; the results file warns that envelope counts describe the untrimmed page.
  - `[false]` Himalayas paging would drop items because `pubDate` is unordered — the raw 20-item page is strictly newest-first; the out-of-order pair is the fixture's hand-picked subset. Note rewritten to say so.
  - `[low]` `[patch]` Committed real listing data vs the Himalayas "never pass them on" term — added a note to swap in synthetic fixtures before any public push; the repo is private today.
  - `[low]` `[patch]` Results table lacked limits/terms for every board — added a "Limits and terms" column covering all 7.
  - `[low]` `[patch]` Hint values inconsistent (`—`) — dropped boards now read "n/a (dropped)".
  - `[low]` `[patch]` WWR mapping ignored `<state>` — mapping and fetch notes now include it, with the eligibility call left to story 1.3.

## Verification

**Manual checks:**
- The results table lists all 7 boards, each with a feed type, field mapping, rate limit or terms note, verdict, reason and hint.
- Each board marked adopt has a fixture file under `__fixtures__/` that parses as its declared format and holds real items.
- The user signs off on the adopted list. This is the hitl gate, recorded in the results file.
