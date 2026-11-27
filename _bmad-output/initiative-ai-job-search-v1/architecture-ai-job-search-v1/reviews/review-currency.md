---
review: currency
target: architecture-ai-job-search-v1.md
date: 2026-11-27
lens: Every committed technology decision is reality-checked (current version, still exists, fits stated use)
verdict: 'Mostly grounded. Every version is current and the core libraries work. Two Node-floor problems and an under-specified Claude invocation need fixing before build.'
---

# Currency Review: AI Job Search v1 Architecture Spine

## Verdict

The Stack table is real. All 14 npm versions match the registry today, and a live probe shows that react-pdf, unpdf and zod work together as AD-6, AD-7 and AD-8 assume. The problems are in what the spine does not say. Node 22 is below the floor for two parts of the stack (Jest with the ESM-only Nest 12 packages, and unpdf's stated support). The `claude -p` invocation in AD-5 does not deliver the isolation AD-5 and AD-10 promise. The spine also never picks Nest 12's new ESM/CJS project choice or its HTTP platform.

## Method

- `npm view <pkg> version` for every Stack row, plus peerDependencies and engines for the Nest plugins, react-pdf and unpdf.
- Local checks: `node --version`, `pnpm --version`, `claude --version`, `claude --help`, `which mongod`, `mongod --version`, `brew info mongodb-community`, `brew services list`. No real Claude prompt was run.
- Live probe in a scratch directory on Node v22.23.2. It rendered a PDF with `@react-pdf/renderer@4.9.2` + `react@19.3.1` (`renderToBuffer`), extracted it back with `unpdf@2.2.3` (`getDocumentProxy` + `extractText`), called `z.toJSONSchema` in `zod@4.6.7`, and tested `require()` of the ESM-only packages.
- Web: the NestJS v12 migration guide (docs.nestjs.com/migration-guide), the Claude Code headless docs (code.claude.com/docs/en/headless), nodejs.org/dist/index.json, and nestjs/nest PR #16391 for TS 7.

## Version check (all confirmed today)

| Package | Spine | Registry / local | Status |
| --- | --- | --- | --- |
| Node.js | 22.23 | local v22.23.2; latest 22.x is 22.23.5; Node 24.22.3 and 26.13.1 are LTS lines | Exists, but see F1. Patch is 3 behind |
| pnpm | 12.14 | local 12.14.0; npm latest 12.23.0 | Minor drift (F7) |
| TypeScript | ~6.0 | latest 7.0.2; `@nestjs/cli` depends on `typescript ~6.0.2` | Correct pin (see below) |
| @nestjs/core | 12.6.3 | 12.6.3 | OK |
| @nestjs/cli | 12.0.15 | 12.0.15 (published 2026-11-20) | OK |
| @nestjs/schedule | 12.0.4 | 12.0.4; peers `@nestjs/core ^11 \|\| ^12`; uses `cron 4.4.0` | OK, fits Nest 12 |
| @nestjs/mongoose | 12.0.2 | 12.0.2; peers `mongoose ^7 \|\| ^8 \|\| ^9`, Nest `^11 \|\| ^12` | OK |
| @nestjs/serve-static | 12.1.1 | 12.1.1; peers `@nestjs/core ^12`; optional peers express ^5 / fastify ^5 + @fastify/static ^10 / `@nestjs/platform-node ^12.3.1` | OK, but the platform is unchosen (F4) |
| mongoose | 9.13.1 | 9.13.1 (driver `mongodb ~7.9`) | OK |
| MongoDB | "installed locally" | `/opt/homebrew/bin/mongod` v8.3.11, `mongodb-community` service started; Homebrew stable is now 9.0.8 | Exists, version unrecorded (F6) |
| vite | 8.4.0 | 8.4.0; engines `^20.19 \|\| >=22.12`; `@vitejs/plugin-react` 6.3.0 peers `vite ^8` | OK |
| react | 19.3.1 | 19.3.1 | OK |
| @react-pdf/renderer | 4.9.2 | 4.9.2; peers react `^16.8 … ^19`; `"type": "module"` | OK, probe passed |
| unpdf | 2.2.3 | 2.2.3 (published 2026-11-26, ESM-only) | Works, but the README says Node 24+ (F1) |
| zod | 4.6.7 | 4.6.7; `z.toJSONSchema` exists, emits draft 2020-12 | OK, probe passed |
| fast-xml-parser | 5.12.1 | 5.12.1 | OK |
| Claude Code CLI | 2.1.332 | local and npm `@anthropic-ai/claude-code` 2.1.332 | OK; flags exist, semantics incomplete (F2, F3) |

### Compatibility claims checked

- **TypeScript ~6.0 vs TS 7.** The pin is correct and should stay. `@nestjs/cli@12.0.15` bundles `typescript ~6.0.2`. The Nest 12 migration guide says `@nestjs/schematics` v12 "requires TypeScript 6 as a peer dependency". `ts-jest@29.4.15` peers `typescript >=4.3 <7`. PR #16391 notes that TS 7 lacks the programmatic API the CLI uses. Add one line to the spine saying TS 7 is deliberately excluded, so nobody "upgrades" it.
- **@react-pdf/renderer server-side with React 19.** Confirmed. `renderToBuffer` produced a valid 1.5 KB PDF in Node 22 with React 19.3.1.
- **unpdf in Node.** It works in practice: `extractText(…, { mergePages: true })` round-tripped the text exactly on Node 22.23.2. But the 2.x README states "Works in Node.js 24+", and it bundles polyfills for `Promise.try` and `Map.prototype.getOrInsert`. Node 22 is outside its stated support (F1).
- **zod 4 `z.toJSONSchema`.** It exists and returns `additionalProperties: false` objects with `required`. That is a valid `--json-schema` input. Watch for `z.number().int()`: it emits `minimum/maximum: ±9007199254740991`, which is harmless.
- **Nest 12 fit for serve-static and schedule.** Both declare `^12` peers. Fine.
- **Homebrew mongod.** It is present, running as a brew service, and v8.3.11.

## Findings

### F1 — HIGH — Node 22 is below the floor for parts of this stack

**Evidence:** The Nest 12 migration guide says "Jest can load the ESM-only v12 packages only on Node.js v24.9 or later", and that ESM projects default to Vitest. The spine's Tests row commits to "Jest, from the Nest starter". unpdf 2.x documents Node 24+. Node 22 is in maintenance and reaches end of life in April 2027, about 5 months away. Node 24 (24.22.3) and Node 26 (26.13.1, current Active LTS) are both available.

**Impact:** Any Jest test that imports `@nestjs/testing` or `@nestjs/*` (AD-7 validation through a Nest service, adapter tests through DI) fails on Node 22. unpdf is running outside its supported range.

**Fix:** Change the Stack row to **Node.js 24 LTS (24.22.x)**, or 26 LTS. Then pin the test runner explicitly: either "Vitest (Nest 12 ESM default)" or "Jest on Node ≥24.9". Don't just say "from the Nest starter", because the starter now asks which one you want. Add `"engines": { "node": ">=24.9" }` to the root `package.json`.

### F2 — HIGH — `claude -p --tools ""` does not isolate Claude the way AD-5 and AD-10 claim

**Evidence:** `claude --help` says `--tools` controls *built-in* tools only. The headless docs say that without `--bare`, "a `-p` session runs the hooks in a project's `.claude/settings.json` and connects the servers in its `.mcp.json`", and loads plugins, skills, auto-memory and CLAUDE.md from the cwd and `~/.claude`. `--bare` would fix this, but it "never reads OAuth credentials". The Structural Seed relies on the *subscription*, so `--bare` is not an option. Sessions are also saved to disk by default, so the resume text and job listings persist in `~/.claude` transcripts.

**Impact:** MCP tools from the user's global config (this machine has Gmail, Drive, Notion and Chrome connectors) and any user hooks stay reachable or running. That violates "Claude never touches files / gets no tool access". It also adds startup latency and nondeterminism.

**Fix:** Change the AD-5 command to:
`claude -p --tools "" --strict-mcp-config --no-session-persistence --permission-mode dontAsk --output-format json --json-schema <schema>`
Spawn it with `cwd` set to an empty app-owned temp directory, so no project `.claude/`, `.mcp.json` or CLAUDE.md is picked up. Pass the instructions with `--system-prompt` rather than relying on defaults. Consider `--setting-sources ""` or `user`, verified against the installed CLI. Add an integration smoke test that runs `--output-format stream-json --verbose` once and asserts the `system/init` event lists no tools and no MCP servers. Before relying on `--setting-sources ""`, confirm locally that it accepts an empty list.

### F3 — MEDIUM — The AD-5 output contract is under-specified, and a future `-p` default change would break subscription auth

**Evidence:** The headless docs say that with `--json-schema`, the validated object is in the `structured_output` field, not `result`. When the run ends without valid structured output, for example because Claude declined, "the response has no `structured_output` field". A failure inside the run, such as missing auth, is printed as the result on stdout, and the exit code is non-zero on failure. The docs also say "`--bare` … will become the default for `-p` in a future release". Under bare mode, OAuth is never read.

**Fix:** Change the AD-5 rule to: "parse stdout as JSON; require exit code 0, `is_error` false and a present `structured_output`; validate `structured_output` with the zod schema; anything else is a `claude_failed` error." Pin the CLI version the app was verified against (2.1.332), check `claude --version` at startup, and log a warning on mismatch. Note in Deferred that a bare-by-default release would need an API key or an opt-out flag. Also add a spawn timeout and SIGINT-then-SIGTERM cleanup (SIGTERM exits 143 with no result). Stdin is capped at 10 MB, which is fine for resume text.

### F4 — MEDIUM — Nest 12 decisions the spine leaves implicit

**Evidence:** The Nest 12 migration guide says `nest new` now prompts for CommonJS or ESM, that all core packages are ESM-only, and that route decorators accept a Standard Schema (`schema`) option for zod. `@nestjs/serve-static` needs one of express, fastify + @fastify/static, or the new `@nestjs/platform-node`. The spine names none of these. Other ESM-only dependencies in the plan are `@react-pdf/renderer`, `unpdf` and `nanoid@6`. CJS works on Node ≥22.12 through `require(esm)`, which the probe confirmed, but it adds friction for Jest.

**Impact:** Two builders could scaffold incompatible apps (CJS+Jest vs ESM+Vitest, express vs platform-node). AD-8 could also end up with two validation styles: class-validator DTOs plus zod.

**Fix:** Add to Stack or Conventions: "API is **ESM** (`"type": "module"`), **Vitest**, **@nestjs/platform-express 12.6.3** (Express 5)". Choose platform-node if you prefer, but name one. Add to AD-8: "HTTP bodies are validated with the shared zod schema through Nest 12's Standard Schema route `schema` option; no class-validator." Also state how `packages/shared` is consumed: built to ESM JS, or TS source via workspace `exports`.

### F5 — LOW — Packages used by the spine but missing from the Stack table

`@nestjs/config` (12.1.1, in the Conventions/Config row), `nanoid` (6.0.2, ESM-only, in the Ids row), `@nestjs/platform-*` (12.6.3, F4), the test runner (F1), and `@vitejs/plugin-react` (6.3.0). Add them with versions, so the table is the complete pin list.

### F6 — LOW — The MongoDB version is unrecorded

The local server is 8.3.11. Homebrew stable is now 9.0.8, so a fresh `brew install` on another machine, or a `brew upgrade`, gives a different major version. Change the row to "MongoDB Community 8.3.11 (Homebrew `mongodb-community`, tested)". Optionally pin the tap formula or note "8.x or 9.x; mongoose 9.13 / driver 7.9". The driver supports both, but confirm against the MongoDB driver compatibility matrix before upgrading.

### F7 — LOW — Minor drift

pnpm 12.14 vs 12.23 latest, and Node 22.23.2 vs 22.23.5 (security patches). Neither matters if F1 moves to Node 24. Record pnpm through `packageManager` in the root `package.json`.

## What holds up

- Every named technology exists today at the stated version. None are deprecated or renamed.
- AD-7's server-side `@react-pdf/renderer` template, AD-6/AD-10's in-process `unpdf` extraction and AD-8's `z.toJSONSchema` → `--json-schema` were proven end to end on this machine.
- The `~6.0` TypeScript pin is correct, not stale.
- `@nestjs/schedule` and `@nestjs/serve-static` both fit Nest 12.
- The Claude CLI flags `-p`, `--tools ""`, `--output-format json` and `--json-schema` all exist in 2.1.332 with the stated meaning. The gaps are in the flags the spine leaves out (F2, F3).

## Sources

- [NestJS migration guide (v12)](https://docs.nestjs.com/migration-guide)
- [nestjs/nest PR #16391 (TS 7 / CLI)](https://github.com/nestjs/nest/pull/16391)
- [Claude Code: Run Claude Code programmatically](https://code.claude.com/docs/en/headless)
- [Node.js release index](https://nodejs.org/dist/index.json)
- unpdf 2.2.3 README (`npm view unpdf readme`)
