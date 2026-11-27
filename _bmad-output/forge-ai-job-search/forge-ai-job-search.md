# Forged idea: AI job search (HARDENED)

Local web app for a jobless, zero-budget, Philippines-based dev to find **eligible remote** roles **early** and send a CV tailored to each one. Success = recruiter responses.

## Locked
- **Core flow (user's words):** open the app → see roles matching a saved preference (e.g. Frontend) → read the job description → tailor CV with Claude → download → apply on the original posting.
- **Core pain:** by the time a posting is seen, 100+ have applied. Optimize for being early, not for volume.
- **Sources:** Remotive, RemoteOK, We Work Remotely, Himalayas, Jobicy, OnlineJobs.ph, Jobstreet, Kalibrr. Prefer public APIs/RSS over HTML scraping; verify each.
- **Fetching:** background job every 30 min (default) → local MongoDB. Page reads Mongo; no live fetch on load.
- **Eligibility first:** keyword rules tag worldwide / APAC / PH-friendly / restricted / unknown. Show only eligible; unknown shown with warning badge; restricted hidden.
- **Ranking:** freshness tiers (<24h, 1–3d, older), sorted by CV match within tier. Match = skill-dictionary overlap (with synonyms) between CV and JD. Min-match cutoff is a setting, default 40%. Freshness falls back to fetcher first-seen time when posted date is unreliable.
- **Resume:** upload PDF once → Claude parses into structured master resume → user reviews/corrects → per-job Claude tailoring from master only → app renders PDF in its own ATS-friendly template.
- **Guardrail:** tailoring reorders/rewords true facts only; never invents skills or experience.
- **Claude:** via Claude Code headless (`claude -p`) on the user's subscription (no API key). Used for resume parse + tailoring **only**.

## Rejected
- LinkedIn/Indeed as main source — same feed as the crowd, fragile, ToS risk.
- Claude for scraping/eligibility/ranking — reserved for resume work.
- Blended match×age score — tiers are easier to reason about.
- Preserving original CV design — response matters, not design.
- Notifications (v1).

## Parked (post-v1)
- Application tracking (statuses, CV version sent) + response-rate stats by source / match band / apply speed.
- Push alerts (Telegram) for high-match <24h jobs.
- Local embeddings if dictionary matching is too blunt.

## Risks
- Subscription usage limits cap tailoring volume.
- Rules-only eligibility → large "unknown" bucket.
- No alerts → being early depends on opening the app often.
- **Build time competes with application time.** Time-box v1 (~2 weeks); keep applying manually in parallel.
