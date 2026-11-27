# AI Job Search

A local, single-process job feed. One NestJS process serves the React SPA, the `/api` routes and an in-process fetch schedule, all on `http://localhost:3000`, backed by a local MongoDB.

The first source is [Remotive](https://remotive.com). Every listing links back to its Remotive page and is marked "via Remotive". Remotive asks for at most about 4 requests a day, so the app fetches it no more than once every 6 hours, however often the schedule ticks.

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
| `FETCH_INTERVAL_MIN` | `30` | Minutes between fetch runs. A source can throttle itself further (Remotive: 360) |
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
  sources/          JobSource port, adapters (remotive), SOURCES registry
  ingestion/        pipeline, schedule, listings + source_runs schemas, ListingsReader
  listings/         GET /api/feed (read-only)
apps/web/src/       React SPA
packages/shared/    zod contract (ListingDraft, FeedResponse, SourceId)
```

## API

- `GET /api/feed` returns `{ items: FeedItem[] }`, newest `effectiveDate` first, with ISO 8601 UTC dates. It reads only stored listings and never waits on a fetch.
- Errors use `{ error: { code, message } }`.
