---
name: dev-skip-mfa
description: DEV_SKIP_MFA=1 env var bypasses every MFA/AAL2 gate (local + Vercel); must be unset before go-live
metadata:
  node_type: memory
  type: project
  originSessionId: 3c774654-5e3f-4bee-a70d-cc419a840fd6
  modified: 2026-10-10T16:21:24.753Z
---

2026-10-10: owner asked for MFA code verification to be skippable during development, including on Vercel. `lib/auth.ts` `getAuthState` returns aal2 when `DEV_SKIP_MFA=1` (no NODE_ENV guard, by owner's request). Uncommitted on the main tree (feat/booking-app).

**Why:** the platform is still in development; the owner didn't want to enter TOTP codes on every sign-in.
**How to apply:** before any go-live or real-patient use, remind the owner to unset DEV_SKIP_MFA on Vercel. The edge function accept-hospital-admin-invitation still checks the JWT aal, so the bypass doesn't cover it. See [[medsync-owner-rules]].

2026-11-01: locally, DEV_SKIP_MFA=1 and the live site's ~56 feature switches live in `~/Desktop/medsync/.env.switches` (gitignored), loaded only by `npm run dev` (`node --env-file-if-exists=.env.switches …next dev`, commit 53b62b3b). Never put flags in `.env.local`: vitest loads it and 22 pharmacy flag tests then fail.

Start script: `npm run dev` runs `scripts/dev.mjs`, which loads `.env.switches` (process.loadEnvFile) and then starts next. Do not use `node --env-file-if-exists`, because Next copies it into NODE_OPTIONS for its worker and Node refuses it (fixed 3 Nov 2026, 1ed711c6). After any env change, stop the old server process first.
