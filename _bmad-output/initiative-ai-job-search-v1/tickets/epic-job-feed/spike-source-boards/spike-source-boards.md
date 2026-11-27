---
type: spike
ticket: '2'
container: _bmad-output/initiative-ai-job-search-v1/tickets/epic-job-feed
created: '2026-11-27'
sign_off: '2026-11-27'
---

# Source spike: which of the other 7 boards can we fetch, and how?

I probed each board on 2026-11-27 with one or two requests (User-Agent `ai-job-search-local`) and read its terms on automated access where the page would load. Remotive was already covered in story 1.1. Source ids follow the spine's kebab-case convention.

## Results

| Board | Source id | Feed | Limits and terms | Verdict | Reason | `eligibilityHint` |
|---|---|---|---|---|---|---|
| RemoteOK | `remoteok` | JSON API `GET https://remoteok.com/api` | No rate limit stated. Terms (element 0 of the response): a followed link back to the job's Remote OK URL and naming "Remote OK" as the source; no logo. | **adopt (API)** | Public API with explicit terms we can meet. | none |
| We Work Remotely | `we-work-remotely` | RSS `GET https://weworkremotely.com/remote-jobs.rss` | `<ttl>60</ttl>`. Terms: `/terms-of-service` returns 403 to automated clients, so the user read it in a browser on 2026-11-27 and found nothing that forbids this use of the RSS feed. Link every item back to WWR. | **adopt (RSS)** | Public, well-formed RSS feed; terms checked by the user. | none |
| Himalayas | `himalayas` | JSON API `GET https://himalayas.app/jobs/api` | Keyless requests get a lower, unstated limit; a free key gives 60/min and 10k/day. API terms: `applicationLink` unchanged for Apply, a visible link to Himalayas, jobs shown only on apps you operate, never passed on. The site ToS bans scraping, but the API is explicitly offered. | **adopt (API)** | Documented public API with terms we can meet. | none |
| Jobicy | `jobicy` | JSON API `GET https://jobicy.com/api/v2/remote-jobs` | 30 req/s per IP; honor `Retry-After` on 429. Notice: credit Jobicy with a direct link, and every apply button goes to the job's `url`. | **adopt (API)** | Documented public API with terms we can meet. | none |
| OnlineJobs.ph | `onlinejobs-ph` | HTML only | `Crawl-delay: 5`. ToS 7.4: use only "without the use of any automated means … except where permission has been expressly granted". | **drop** | Terms forbid automated access, and there is no API or RSS. | n/a (dropped) |
| Jobstreet (PH) | `jobstreet` | HTML only | The listing page returns 403. robots.txt disallows `/api/jobsearch/`, `/graphql` and every query-string URL. The ToS was not read: the site blocks us before the terms matter. | **drop** | Bot-blocked, with no public API. | n/a (dropped) |
| Kalibrr | `kalibrr` | Undocumented internal JSON (`/kjs/job_board/search`) | No published API or rate limit. The ToS reserves action against "automated extraction, scraping". | **drop** | Not a published API. Also mostly on-site PH roles: 2 of 10 sampled were work-from-home. | n/a (dropped) |

**Net:** 4 boards adopted (RemoteOK, We Work Remotely, Himalayas, Jobicy), all through API or RSS. No HTML board is adopted, so story 1.10 (HTML boards) has nothing to build and can be dropped, which matches C7's "HTML cut first". Story 1.9 builds the adopted adapters.

## Field mapping to `ListingDraft` (AD-2)

| Board | `sourceJobId` | `url` | `title` / `company` | `descriptionHtml` | `locationText` / `locationTags` | `postedAt` |
|---|---|---|---|---|---|---|
| RemoteOK | `id` (string) | `url` | `position` / `company` | `description` (HTML) | `location` (e.g. "US Only", "Worldwide", "Asia"; may be "") / `[]` | `date`, ISO with `+00:00` |
| WWR | `<guid>` (the job URL) | `<link>` | `<title>` is "Company: Title", split on the first ": " | `<description>` (escaped HTML) | `<region>` (e.g. "Anywhere in the World", "USA Only", "Asia Only") / non-empty `<country>` and `<state>` | `<pubDate>`, RFC 822 with zone |
| Himalayas | `guid` (the job URL) | `applicationLink` (required unchanged by terms) | `title` / `companyName` | `description` (HTML) | null / `locationRestrictions` (array of countries) | `pubDate`, epoch **seconds** |
| Jobicy | `id` (string) | `url` | `jobTitle` / `companyName` | `jobDescription` (HTML) | `jobGeo` (e.g. "USA", "Europe", "Australia,  New Zealand", "Philippines"; comma-separated, with double spaces) / `[]` | `pubDate`, ISO with zone |

## Fetch notes for story 1.9

- **RemoteOK:** the array's element 0 is the legal notice, not a job, so skip it. The response has about 100 jobs and no paging or `since`. 76 of 100 were "US Only", so expect a low yield after eligibility. Suggested `minIntervalMin: 60`.
- **WWR:** one feed of 100 items, with no paging or `since`. Respect the `ttl`: `minIntervalMin: 60`. Region "Anywhere in the World" was 80 of 100 items. Some items pair that region with a `<state>` (e.g. "Ohio") and an empty `<country>`. Treat `<region>` as the eligibility signal and the state as a note, not a restriction; that is story 1.3's rule call.
- **Himalayas:** the full feed is about 117k jobs. Page with `?cursor=` (`nextCursor`; offset is deprecated). The raw page arrived newest `pubDate` first, so stop paging at the first item older than `since`, and cap pages per run. The fixture's items are a hand-picked subset, so their order means nothing. All 20 sampled items had a non-empty `locationRestrictions`, so whether "worldwide" appears as an empty array is unconfirmed. Suggested `minIntervalMin: 30`.
- **Jobicy:** `count` is up to 50, with cursor paging (`nextCursor`, valid 24 h). The 30 items sampled (20 unfiltered, 10 with `geo=apac`) held no worldwide or "Anywhere" item. `geo=apac` returns Australia, New Zealand, Japan, Malaysia and the Philippines, so story 1.9 may fetch with `geo=apac` to cut restricted noise; that is its call.
- No adopted board marks itself board-wide worldwide or PH-friendly, so all hints are none. Eligibility comes from each item's own location field (AD-4 level 1).

## Fixtures

Shaped from real payloads saved on 2026-11-27, with the `jobs` arrays trimmed to 4 items. The repo is public, so every listing's text, company, URL, slug and logo is synthetic (Acme Remote Co and so on). Field names, types, dates, location fields and wrappers are kept exactly as served. RemoteOK keeps its legal element. The Himalayas and Jobicy envelopes keep their `jobCount`, `totalCount` and `nextCursor`, which describe the untrimmed page, so tests must not assert them against the item count. The WWR channel is kept as served.

| File | Location cases inside |
|---|---|
| `apps/api/src/sources/adapters/__fixtures__/remoteok.json` | "Worldwide", "Asia", "US Only", "" |
| `apps/api/src/sources/adapters/__fixtures__/we-work-remotely.xml` | "Anywhere in the World" (with a state), "Asia Only", "USA Only" ×2 |
| `apps/api/src/sources/adapters/__fixtures__/himalayas.json` | a list including the Philippines, United States only, Europe-wide, Australia only (no worldwide case seen) |
| `apps/api/src/sources/adapters/__fixtures__/jobicy.json` | "USA", "Poland,  UK,  USA", "Australia,  New Zealand", "Philippines" (no worldwide case seen) |


## Sign-off

Signed off by the user on 2026-11-27: RemoteOK, We Work Remotely, Himalayas and Jobicy adopted; OnlineJobs.ph, Jobstreet and Kalibrr dropped. WWR's terms were read by the user in a browser. Story 1.10 (HTML boards) has nothing to build.
