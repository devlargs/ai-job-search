# AI Job Search

A local, single-process job feed. One NestJS process serves the React SPA, the `/api` routes and an in-process fetch schedule, all on `http://localhost:3000`, backed by a local MongoDB.

## Sources

Every listing links to its original posting and is marked "via <board>" in the feed and the detail view. Each board is fetched no more often than its throttle, however often the schedule ticks.

| Board | Feed | Throttle | Credit and link rule |
| --- | --- | --- | --- |
| [Remotive](https://remotive.com) | JSON API | 6 h | Link back to the Remotive job page and credit Remotive; at most about 4 requests a day |
| [Remote OK](https://remoteok.com) | JSON API | 60 min | Link (followed) to the job's Remote OK URL and name "Remote OK" as the source; no logo |
| [We Work Remotely](https://weworkremotely.com) | RSS | 60 min (feed `ttl`) | Link every item back to its WWR page |
| [Himalayas](https://himalayas.app) | JSON API, newest 5 pages per run | 30 min | Apply uses `applicationLink` unchanged; show a visible link to Himalayas |
| [Jobicy](https://jobicy.com) | JSON API, newest 50 per run | 30 min | Credit Jobicy with a direct link; apply goes to the job's `url` |

## Prerequisites

- Node.js 24 (`.nvmrc`; `engines` requires `>=24.9`)
- pnpm 12 (`corepack enable` picks up the `packageManager` version)
- MongoDB running locally, for example `brew services start mongodb-community`

## Setup

```sh
cp .env.example .env   # optional: every variable has a default
pnpm install
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `MONGO_URI` | `mongodb://localhost:27017/ai-job-search` | MongoDB connection string |
| `FETCH_INTERVAL_MIN` | `30` | Minutes between fetch runs. A source can throttle itself further (see Sources) |
| `PORT` | `3000` | HTTP port for the API and the SPA |

## Commands

| Command | What it does |
| --- | --- |
| `pnpm build` | Builds `packages/shared`, then `apps/web`, then `apps/api` |
| `pnpm start` | Runs the built app (`node apps/api/dist/main.js`) on `localhost:3000` |
| `pnpm dev` | Builds `shared`, then runs the API in watch mode and the Vite dev server (`localhost:5173`, proxies `/api` to `:3000`) |
| `pnpm test` | Runs every workspace's Vitest suite. No test touches the network |

## Layout

```text
apps/api/src/
  sources/          JobSource port, adapters (remotive, remoteok, we-work-remotely, himalayas, jobicy), SOURCES registry
  ingestion/        pipeline, schedule, listings + source_runs schemas, ListingsReader
  listings/         GET /api/feed (read-only)
apps/web/src/       React SPA
packages/shared/    zod contract (ListingDraft, FeedResponse, SourceId)
```

## API

- `GET /api/feed` returns `{ resumeStatus, tiers: { fresh, recent, older } }`. Tiers are by `effectiveDate` age (`fresh` ≤ 24h, `recent` > 24h to 72h, `older` > 72h), each ordered by score then newest first, with ISO 8601 UTC dates. Restricted listings are excluded, and each item carries its `eligibility`. It reads only stored listings and never waits on a fetch.
- Errors use `{ error: { code, message } }`.
