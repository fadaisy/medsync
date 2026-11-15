---
name: emr-engine-build-state
description: EMR engine build (PROMPT-ENCOUNTER-EMR + Clinical Fact Contract) started 2026-09-26 in worktree medsync-emr on feat/emr-engine; owner signed all GATE A decisions; PGlite harness at ~/Desktop/emr-harness
metadata:
  node_type: memory
  type: project
  originSessionId: 623d3ce8-ef37-406d-9dbd-b375e44643b5
  modified: 2026-09-26T06:44:25.400Z
---

Started 2026-09-26. Owner (Fadhul, also CSO) gave a blanket sign-off on every GATE A decision in the five specs
(PROMPT-ENCOUNTER-EMR, MS-DATA-CFC-001, MS-EMR-CLIN-001, MS-NCD-ENG-001, clinical-fact-concepts.v1.json) and said
"go through all gates", "minimal tokens, agents but not hundreds", ponytail + frontend-design + emil skills.

- Worktree `/Users/airm1/Desktop/medsync-emr`, branch `feat/emr-engine` cut from feat/booking-app @ 004772d.
  node_modules cloned with `cp -Rc`; `.env.local` there is a DEAD-DB harness env (synthetic PHI key) — never real secrets.
- Specs copied from ~/Downloads into `docs/emr/`. Discovery notes go in `docs/emr/discovery/`.
- PGlite harness `~/Desktop/emr-harness/pg` (copied from resus-v2-harness; run.mjs REPO points at the worktree
  migrations) replays 0000–0070 cleanly. Use it to verify new migrations + RLS probes (not a repo dependency).
- 8 GB machine: keep parallel agents ≤ 4 and never run tsc/build in parallel.

- DONE 2026-09-26: P0–P8 committed on feat/emr-engine (10 commits a701e95…df549fd, HEAD df549fd). Full suite 6,199
  passed / 0 failed; migrations 0071–0075 GATED (unapplied; 0075 = co-sign defaults for all hospitals); ADRs 0130–0139; flags EMR_V1, EMR_PRESCRIBING.
  Gate record `docs/emr/STOP-REPORTS.md`; path `docs/emr/HARMONISATION.md`; owner steps `docs/emr/OWNER-RUNBOOK.md`.
  Report page (screens + steps): https://claude.ai/artifact/HHMiMYe6fDKdQ8vJT5WxGk (source in session scratchpad).
  Owner-support round (0fcfdaf): npm run emr:{legacy-counts,backfill-allergies,reencrypt-drafts,encrypt-allergy-text}
  (dry-run default, --apply --actor <uuid>), hosted RLS twin tests/rls/emr-access.test.ts, nurse orders panel,
  resus outstanding tests → proposed orders (A5 full). Owner said "do what you can, I'll do the rest".
  Open: flag-off route JS needs a real signed-in render; loader p95 on real Postgres; accepted resus proposals
  route results to the resus leader (clinical call); OPD formulary needs sourced CSO-signed doses.
- 2026-09-27 PROD: owner applied 0071–0075 in production (verified read-only: 83 migrations, backfill 1 allergy + 2
  assertions, 0 hospitals without co-sign policies) and deployed ha-start/ha-complete-encounter. Dev Supabase project
  (another account, eu-west-1) = EMR folder .env.local. Prod DB password was rotated after I leaked it in an error message.
- RELEASE: worktree `~/Desktop/medsync-release`, branch `release/emr` = feat/booking-app (e58e06e: tester feedback
  committed) + feat/emr-engine merge + ADR 0161 dialogs (c955e05, 188da32) + wards date fix (86c30f4). Full suite green,
  build + a11y green. Dev .env.local REMOVED there (never deploy with it); `.vercel` link copied. Owner deploys it.
  Chroma (medsync-chroma, uncommitted, not live) is NOT in the release.
- Scratch harness `~/Desktop/emr-harness/{app,route,plans,shots}`: `sh sync.sh`, next build, next start -p 3999,
  `node cdp.mjs plans/all.json` re-shoots all 240 screens.
- A session limit killed a parallel workflow once; resume by editing the script (drop finished agents) — cached
  prefix replay breaks if an earlier agent's prompt changes.
- Services-hub session (feat/hospital-services-hub, 0080, ADRs 0150–0160) agreed a merge rule: HARMONISATION §9.

**Why:** the prompt assumes Prisma/pnpm/Edge Functions; the repo (Drizzle, npm, server actions) wins — harmonise, report.
**How to apply:** migrations stay GATED (owner runs `npm run db:migrate`); no push; notify owner (PushNotification) at the end.
Related: [[medsync-owner-rules]] [[doctor-workspace-build-state]] [[resus-desk-v2-build-state]]
