---
name: review-fixes-build
description: 11 Nov 2026 senior review → fix packages; worktree medsync-fixes on fix/review-perimeter; fix-plan artifact must be updated as fixes land
metadata:
  node_type: memory
  type: project
  originSessionId: 036750b5-9472-46f8-9a69-c2c69ab10e41
  modified: 2026-11-11T13:12:17.332Z
---

Senior review of 11 Nov 2026 (REVIEW/senior-review-2026-11-11.md in the main folder, verdict No, 63 findings) is being fixed package by package from the fix plan.

- Worktree `~/Desktop/medsync-fixes`, branch `fix/review-perimeter` off origin/main 2de1cb3f. Pushed 12 Nov (no PR).
- Package 1 done: b7f6d5f6 (shared `lib/auth/reachable.ts`; closes C-1, H-14, scope half of C-4; L-4 still open).
- Package 2 done 12 Nov: deb9c580 (migration 0284 GATED, unapplied: column grants on users/patient_profiles etc, user_roles client writes revoked; getCaller refuses suspended/deactivated; suspend/deactivate ban the auth user). Closes C-4, M-1, M-2, M-3, L-2. Verified on PGlite via scratch script (copies grants semantics). 0279–0283 used on other branches, so next free migration is 0285.
- Package 3 done 12 Nov: 09fa94f4 (next 16.4.6, sentry ^10.78, zod ^4.6.7, shadcn → devDeps, allowScripts in package.json, CI audit gate). Closes H-1, L-12. Never run `npm audit fix --omit=dev`: it prunes devDeps from node_modules; run `npm install` after.
- Package 4 done 12 Nov: 7b83ea52 (0285 GATED unapplied: public.caller_mfa_ok() + RESTRICTIVE mfa_gate on every RLS table in public/pharmacy_practice, TO authenticated only; getCaller rpc's it; private.dev_switches 'skip_mfa' row = DB twin of DEV_SKIP_MFA, dev DB only). Also M-15, M-16, L-3, cron half of L-1. Apply 0284 then 0285 BEFORE deploying Edge Functions (getCaller fails closed without the function). Next free migration 0286. Only C-3 critical left.
- C-3 arms + H-11 done 12 Nov: df644bf7, migration 0287_superadmin_off_phi (GATED, unapplied): edits live policies in place to drop only the superadmin arm on 42 patient tables, drops audit_log superadmin SELECT, avatars = own + clinician_directory. Still open in C-3: audit rows hold whole records. Numbered 0287 because main took 0279–0286 (prescribing); main's 0284/0285 clash by number with this branch's (runner tracks full names, so both apply).
- H-7 URL + processor parts done 12 Nov: 1253d2f6 (lib/scrub-url, Analytics beforeSend via ScrubbedAnalytics in app/providers.tsx, Sentry beforeSend/beforeSendTransaction, /reception/find POST + 5-min httpOnly cookie) and 6b04a175 (content/legal.ts names Supabase, Vercel, Africa's Talking, Expo, Sentry; owner approved the wording 12 Nov, recorded in 4c24af5b). Main session called the URL work "H-8"; in the review it belongs to H-7.
- 12 Nov (owner said "Yes, renumber"): origin/main merged in (97a2a632), then 3b755786 renumbered: 0284_lock → 0287, 0285_mfa → 0288, 0287_superadmin_off_phi → 0289. Older bullets use the old numbers. One `npm run db:migrate` in medsync-fixes now applies 0279–0289 in order; PGlite replay confirmed every RLS table (main's 6 new ones included) gets mfa_gate. Next free migration 0290. Owner applied 0279–0289 and redeployed all Edge Functions 12 Nov (owner's word; Claude's dry-run check was blocked). Web app not deployed. Supabase CLI only via `npx supabase … --project-ref "$(cat ~/Desktop/medsync/supabase/.temp/project-ref)"` (no global install, worktree not linked).
- Tests here: run with `SKIP_ENV_VALIDATION=1` (no .env.local in the worktree); PGlite lane via symlink node_modules/@electric-sql (made 12 Nov).
- No mobile/node_modules in that worktree, so tests/patient-web/care and help fail to load there (not a code fault).
- Artifacts: review https://claude.ai/artifact/PpSrKV3KS3qNJCutmTtjmu, fix plan https://claude.ai/artifact/GVeCfgW2aCear2CcZjeJN6 (file REVIEW/fix-plan.html).

**Why:** owner asked that every fix actively changes the scores on the fix plan page.
**How to apply:** after each commit, add entries to the `DONE` array in REVIEW/fix-plan.html (key = finding id, `X:part` for partial, pkg, commit hash) and republish the same file. Migrations still go to the owner to apply ([[medsync-owner-rules]]).
