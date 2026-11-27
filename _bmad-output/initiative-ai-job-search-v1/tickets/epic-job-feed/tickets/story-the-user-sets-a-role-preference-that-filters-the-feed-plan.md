---
title: 'The user sets a role preference that filters the feed'
type: feature
ticket: '7'
created: '2026-11-27'
status: built
baseline_revision: '079b0e2b89aaeb957c7f2b5aae4b9f98eba44913'
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

**Problem:** R7: the user wants only listings matching a role or skill preference, such as "Frontend" or "ReactJS". R5: the minimum match score is user-set, default 40. Today the feed has no preference, and `minMatch` is the constant `DEFAULT_MIN_MATCH`.

**Approach:**
- Add a `preference` module holding one document `{ roleKeywords: string[], minMatch: number }`, defaults `[]` and `40` (AD-9), served by `GET` and `PUT /api/preference`.
- The feed applies the preference after the restricted filter and before scoring (AD-4 step 2). A listing passes when any keyword matches:
  - a keyword that resolves to a `SkillId` through `skills.json` matches the listing's `skills`;
  - any other keyword matches the title, case-insensitively, on a word boundary;
  - an empty `roleKeywords` passes everything.
- The feed then drops non-null scores below the preference's `minMatch`.
- The page gets a small settings form that saves the preference and reloads the feed.

## Boundaries & Constraints

**Always:**
- AD-9: exactly one preference document, in the `preference` collection, upserted with a fixed `_id` such as `'active'`. A missing document reads as the defaults.
- The contract is zod in `packages/shared` (AD-8): `Preference = { roleKeywords: string[] (each trimmed, 1–40 chars, at most 20, duplicates removed case-insensitively), minMatch: int 0–100 }`.
  - `PUT` validates the body with it. An invalid body gets 400 in the error envelope (`{ error: { code, message } }`) and nothing is saved.
  - `GET` and `PUT` both return the stored preference.
- Keyword resolution reuses `matching`'s `normalize` and the `skills.json` synonym lists. A keyword resolves to a skill when its normalized form equals one of that skill's normalized synonyms ("ReactJS" and "React" give `react`). Title matching uses `mentions` (whole words).
- The pass rule is a pure function in `matching`: `passesPreference({ title, skills }, roleKeywords, skillsRules)`.
- `GET /api/feed` stays 200 for any DB state. If the preference can't be read, the feed uses the defaults and logs a warning.

**Never:**
- No more than one preference, and no per-tier or per-source preference. No detail page (story 1.8). No resume work. The web gets no router; the form sits on the same page.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Title keyword | `['Frontend']`; titles "Senior Frontend Engineer" and "Backend Dev" | only the first | none |
| Skill keyword | `['ReactJS']`; listing skills `['react']` with no "React" in the title | passes | none |
| Either matches | `['Frontend','React']`; listings A (Frontend title, no react skill), B (react skill), C (neither) | A and B | none |
| Word boundary | `['Java']`; title "JavaScript Developer", skills `['javascript']` | does not pass (the keyword resolves to `java`, and "java" is not a whole word in the title) | none |
| Empty keywords | `[]` | every listing passes | none |
| minMatch | minMatch 70 with scores 80, 60, null | 80 and null kept | none |
| No document | fresh DB | `GET /api/preference` returns `{ roleKeywords: [], minMatch: 40 }` | none |
| Invalid PUT | `minMatch: 150`, a keyword of `""` or 41 chars, or 21 keywords | 400 envelope; stored preference unchanged | validation error |
| Save and reload | PUT `{['Frontend'], 55}`, then GET | the same values | none |

</intent-contract>

## Code Map

- `packages/shared/src/preference.schema.ts` (new) -- `Preference` and `DEFAULT_PREFERENCE = { roleKeywords: [], minMatch: 40 }`. Export them from `index.ts`.
- `apps/api/src/matching/preference-match.ts` (new) -- `resolveKeyword(keyword, skills) → SkillId | null` and `passesPreference(...)`, with a spec covering the matrix rows. Reuse `text-match.ts`.
- `apps/api/src/preference/` (new) -- `preference.schema.ts` (Mongoose, collection `preference`), `preference.service.ts` (`get()` returns the stored value or the defaults; `set(p)` upserts `_id: 'active'`), `preference.controller.ts` (`GET`/`PUT preference` under the global `/api`), and `preference.module.ts`, which exports `PreferenceService`. Validate in the controller with `Preference.safeParse` and throw `BadRequestException` on failure; the global `ErrorEnvelopeFilter` shapes it.
- `apps/api/src/app.module.ts` -- import `PreferenceModule`.
- `apps/api/src/listings/listings.service.ts` -- inject `PreferenceService` and `MatchingRules`. `getFeed` reads the docs, resume set and preference in parallel, with the preference read wrapped so a failure falls back to `DEFAULT_PREFERENCE`. It then filters with `passesPreference`, scores, drops scores below `pref.minMatch`, and tiers. Remove `DEFAULT_MIN_MATCH`, or re-export it from the shared default. `listings.module.ts` imports `PreferenceModule` and `MatchingModule`.
- `apps/api/src/listings/listings.feed.spec.ts` -- the preference filter and the minMatch-from-preference cases, plus the preference-read-failure fallback. `preference.controller.spec.ts` or a service spec -- defaults, save and reload, invalid PUT.
- `apps/web/src/api.ts` -- `fetchPreference()` and `savePreference(p)` (parsed with the shared schema; errors use the envelope message). `apps/web/src/PreferenceForm.tsx` (new) has a keywords text input (comma-separated), a number input for minimum match % (0–100), and a Save button. It shows a saved or error state and calls `onSaved` so `App` refetches the feed. `App.tsx` renders it above the tiers. `styles.css` gets small form styles.
- Do not touch ingestion, adapters or the eligibility rules.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/preference.schema.ts`, `index.ts` -- the contract and defaults.
- [x] `apps/api/src/matching/preference-match.ts` and its spec -- the pure pass rule.
- [x] `apps/api/src/preference/*`, `app.module.ts` -- storage and endpoints, with specs.
- [x] `apps/api/src/listings/listings.service.ts`, `listings.module.ts`, `listings.feed.spec.ts` -- the preference in the feed.
- [x] `apps/web/src/api.ts`, `PreferenceForm.tsx`, `App.tsx`, `styles.css` -- the settings form.

**Acceptance Criteria:**
- Given a running app, when `PUT /api/preference` sets `{"roleKeywords":["Frontend","React"],"minMatch":40}`, then every item from `GET /api/feed` has "Frontend" in its title or `react` among its stored skills.
- Given that preference, when it is set back to `{"roleKeywords":[],"minMatch":40}`, then the feed returns the same item count as before any preference.
- Given a saved `minMatch` of 55, when the app restarts and `GET /api/preference` is called, then it returns 55.
- Given the built page, when it loads, then the settings form shows the stored keywords and minimum match, and saving reloads the feed.

## Implementation Notes

## Plan Change Log

## Review Triage Log

### 2026-11-27 — Review pass
- verdicts: 6 findings — high 0, medium 0, low 6, false 0, maybe-false 0
- findings:
  - `[low]` `[reject]` Malformed JSON in `PUT /api/preference` fails in Express's body parser before the envelope filter — the only client is the app's own form, which always sends valid JSON; an envelope needs a body-parser error middleware, which is new surface.
  - `[low]` `[reject]` The controller validates with manual `Preference.safeParse` rather than AD-8's Nest Standard Schema support — the plan's Code Map asks for this; no caller is harmed today. Worth aligning in the refactor sweep (entry 11) before more body endpoints copy it.
  - `[low]` `[patch]` Keywords with no letter or digit ("++") are saved and silently empty the feed — the schema now requires a letter or digit; a 400 spec case was added. ("C#" normalizing to "c" is noted, not fixed.)
  - `[low]` `[patch]` After a failed load, the form could save placeholder defaults over the stored preference — inputs and Save stay disabled until a load succeeds.
  - `[low]` `[patch]` An invalid stored preference silently became the defaults — `get()` now logs a warning naming the failure; spec added.
  - `[low]` `[patch]` `set()` re-read after the upsert, so a failed read made a saved PUT a 500 — it returns the validated input; spec added.

## Verification

**Commands:**
- `pnpm build && pnpm test` -- expected: exit 0; the new matching, preference and feed specs pass.
- `pnpm start` (background), then:
  - `curl -s localhost:3000/api/preference` -- expected: the defaults on a fresh DB.
  - Record the feed item count, `PUT` `{"roleKeywords":["Frontend","React"],"minMatch":40}`, and check every feed item against its title and its `skills` in mongosh -- expected: all pass the rule.
  - `PUT` the empty keywords -- expected: the original count.
  - `PUT` `{"roleKeywords":[],"minMatch":150}` -- expected: 400 with `error.code`.
  - `PUT` minMatch 55, restart, then GET -- expected: 55.
  - Finally `PUT` `{"roleKeywords":[],"minMatch":40}` to leave the DB at the defaults, stop the server with `pkill -f dist/main.js`, and confirm port 3000 is free.
- `grep -c "Minimum match" apps/web/dist/assets/*.js` -- expected: ≥ 1.

## Auto Run Result

**Summary:**
- One AD-9 preference `{ roleKeywords, minMatch }` (defaults `[]` and 40) is stored as `_id: 'active'` in `preference`. `GET` and `PUT /api/preference` serve it, and an invalid body gets a 400 in the envelope.
- The feed applies a pure `passesPreference` after the restricted filter. A keyword that resolves to a skill through `skills.json` matches the listing's `skills`, any other keyword matches the title on whole words, and empty keywords pass everything. The feed then drops non-null scores below the preference's `minMatch`. A failed preference read falls back to the defaults with a warning.
- The page has a settings form (keywords and minimum match %) that saves and reloads the feed.

**Files:**
- `packages/shared/src/preference.schema.ts`: the contract.
- `apps/api/src/matching/preference-match.ts` and its spec: the pass rule.
- `apps/api/src/preference/*`: storage, endpoints and specs.
- `apps/api/src/app.module.ts`: wires in the preference module.
- `apps/api/src/listings/*`: the preference in the feed and the minMatch from the preference.
- `apps/web/src/api.ts`, `PreferenceForm.tsx`, `App.tsx`, `styles.css`: the settings form.

**Review:** quick lens, 6 findings.
- 4 patched (all low).
- 0 deferred.
- 2 rejected: the malformed-JSON envelope, and manual validation versus AD-8, which is noted for the refactor sweep.

**Follow-up review recommended:** false.

**Verification:**
- `pnpm build` passes, and `pnpm test` passes 128 tests.
- Live:
  - The defaults show on a fresh DB.
  - Saving `["Frontend","React"]` cut the feed from 9 items to 4, and all 4 pass the rule.
  - `["++"]` and `minMatch: 150` get a 400.
  - `minMatch` 55 survives a restart.
  - Resetting brings back 9 items. The DB was left at the defaults.

**Residual risks:**
- The form was not checked in a browser.
- Skill keywords are broad when a listing's skill list is long.
- "C#" matches a standalone "C".

