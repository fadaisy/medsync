# ADR-0012: Vercel deployment

- **Status:** Accepted
- **Date:** 2026-05-22
- **Phase:** 0.12
- **Deciders:** Usama Fadhul

## Context

Phase 0.12 puts the platform on the public internet for the first time. The kickoff originally called for the custom domain `medsync.health`; per Usama's instruction during this session, custom-domain wiring is deferred and we ship on Vercel's auto-generated URL.

## Decisions

### 1. Hosting: Vercel, new project named "medsync"

- Vercel CLI installed as a dev-dep (`vercel@54.3.0`) — sandbox blocked the global install. `npm`/`npx` invocations work the same.
- Linked the directory via `vercel link --yes --project medsync --scope fadhulusama-gmailcoms-projects`. Project was auto-created (no pre-existing project under that name on the account).
- Production URL: **https://medsync-bice.vercel.app** (Vercel's default `<project>-<suffix>.vercel.app` alias). Custom domain `medsync.health` deferred.

### 2. Environment variables pushed for Production + Development only

Wrote [`scripts/push-env-to-vercel.mjs`](../../scripts/push-env-to-vercel.mjs) — reads `.env.local` via `@next/env` (Node's `--env-file` parser silently drops some lines containing `:`; `@next/env` is the same loader Next uses internally and handles them) and pushes each var to Vercel via `vercel env add KEY ENV --value V --force`.

Pushed to Production + Development:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `DATABASE_DIRECT_URL`

Optional vars skipped because not set locally yet:

- `MEDSYNC_PHI_KEY` (Phase 0.7 lib has no callers yet)
- `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_AUTH_TOKEN` (Sentry init no-ops without DSN)
- `AFRICASTALKING_*` (Phase 5+)

**Preview env vars deferred:** the current Vercel CLI's `--yes` flag is ignored for `vercel env add KEY preview --value V`; it asks for a git branch even with `--yes` (looks like a CLI/wrapper bug). Workaround: set preview env vars manually via the Vercel dashboard if/when we cut a preview branch. Production deploy doesn't need them.

### 3. Build pipeline

- Vercel auto-detects Next.js (Build Command: `next build`, framework `nextjs`).
- Build runs `next build` with all five required env vars present → env validation passes → 53s build, 8 static + dynamic routes emitted, proxy middleware detected.
- Sentry isn't wrapped because `SENTRY_DSN` is unset — `next.config.ts` short-circuits `withSentryConfig`.

### 4. Smoke test on the deployed URL

```
GET https://medsync-bice.vercel.app/             → 200 (21 KB)
GET https://medsync-bice.vercel.app/styleguide   → 200 (184 KB)
GET https://medsync-bice.vercel.app/api/health   → 404  (dev-only; correctly blocked)
```

The landing page, the full styleguide, and the env-gated health endpoint all behave as designed.

### 5. CI/CD posture

- **Production deploys** trigger via `npx vercel deploy --prod` (manual until a `main` branch push triggers Vercel's auto-deploy — that hook auto-activates once the repo is connected to a GitHub remote, which isn't done yet).
- **Preview deploys** auto-activate per PR once we link the repo to a GitHub remote (not done yet).
- **No GitHub Actions CI** in this phase. The pre-commit hook (Husky + lint-staged + typecheck) is the local gate. CI runs on Vercel's build itself (typecheck + lint via the Next build pipeline). Separate CI for `npm test` (RLS / encryption / audit / auth tests) is a Phase 1 follow-up — those tests hit live Supabase and need a dedicated test project.

### 6. Custom domain `medsync.health` — deferred

Per Usama's direct instruction during this session, the custom domain is out of scope for 0.12. To add later:

1. `npx vercel domains add medsync.health` (after registering)
2. Configure DNS at the registrar per Vercel's instructions
3. `npx vercel alias set <production-deployment> medsync.health`

## Consequences

**Positive**

- The platform is publicly reachable. Anyone with the URL can hit `/` and `/styleguide` immediately. Sign-up + sign-in work end-to-end against the same Supabase project the dev tests run against.
- One command (`npx vercel deploy --prod`) ships a new build. CI/CD via GitHub remote auto-trigger is one `git remote add origin ...` away.
- Env var push is scripted and idempotent — adding a new var means appending to the `VARS` array in `scripts/push-env-to-vercel.mjs` and re-running.
- Vercel Analytics auto-activates on a Vercel deploy (the `<Analytics />` component added in 0.8 starts emitting page-view events).

**Negative / trade-offs**

- **Preview env vars unset.** A preview deploy from a future PR won't have its own Supabase URL/keys until we either: (a) work around the CLI bug, or (b) add them via dashboard, or (c) write the script to upload per-branch. Currently preview branches would fall back to Production env vars (Vercel's default when preview-specific isn't set) — acceptable for Phase 0.
- **No custom domain yet.** Sign-up emails (Supabase Auth → user) will include the Supabase project domain in confirmation links, not our brand. Patient-facing surfaces will look unbranded until we wire `medsync.health`. Acceptable for Phase 0 (no real patients yet).
- **Same Supabase project for dev and prod.** Tests run against the production database. Phase 1+ should split into separate Supabase projects per environment.
- **Sentry not wrapped** because no DSN. Production errors land in Vercel runtime logs only until DSN is set.
- **No GitHub remote yet** — production deploys are manual. Trivial to fix when ready: `gh repo create` + `git push -u origin main` triggers Vercel's auto-deploy.

## Alternatives considered

- **Custom domain in 0.12.** Explicitly out-of-scope per Usama's instruction during the session.
- **Vercel Postgres / Vercel Marketplace Supabase integration.** Rejected — Supabase project already exists outside Vercel; integrating now would just add a layer of indirection. Re-evaluate if we ever want one-click env var sync via Vercel's marketplace integration.
- **GitHub Actions CI separately.** Deferred — Vercel's build already runs typecheck/lint, and the test suite needs Supabase credentials we don't want in a public Actions log without environment scoping. Phase 1+ will set up GitHub Actions with proper secret scoping.
- **Rolling Releases / Canary deploys** (mentioned in Vercel knowledge update). Deferred — production has no real users yet; canary buys us nothing in Phase 0.
- **`vercel.ts` configuration file** (the newer alternative to `vercel.json`). Skipped — we have no overrides to declare; Vercel's auto-detection is sufficient.

## Follow-ups

- Connect a GitHub remote → enable Vercel auto-deploy on push to `main` and PR previews.
- Set preview env vars via dashboard (or fix the script's `--yes` bug) so preview deploys can hit Supabase.
- Add `medsync.health` domain when ready (3 commands above).
- Spin up a separate Supabase project for production once real patient data is on the horizon (Phase 5+); update env vars to point production deploys at the prod project, keep dev pointing at the current project.
- Configure Supabase Auth → email confirmation enabled before first real user (Phase 0.9 sign-up currently auto-confirms).
- Set `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` on Vercel env once Sentry project is ready.
- Generate `MEDSYNC_PHI_KEY` and push to Vercel before Phase 1 lands the first encrypted column.
