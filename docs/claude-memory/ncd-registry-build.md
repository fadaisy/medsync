---
name: ncd-registry-build
description: "NCDSync registry build (PROMPT-NCDSYNC-BUILD-v2) in worktree medsync-ncdreg on feat/ncd-registry; P0–P11 run 2026-10-05, FINAL-REPORT written; not pushed; 0093 applied 2026-10-06"
metadata:
  node_type: memory
  type: project
  originSessionId: 3a60a5e8-8927-488f-a029-6a0ea209b144
  modified: 2026-10-05T20:57:55.435Z
---

Worktree `~/Desktop/medsync-ncdreg`, branch `feat/ncd-registry` from origin/main 8e45d34 (upstream unset, never pushed). Ledger `docs/ncd/PROGRESS.md`, decisions D-01–D-35 in `docs/ncd/DECISIONS.md`, final report `docs/ncd/FINAL-REPORT.md`. Module `lib/ncdreg/`, routes `app/ncd/`, tests `tests/ncdreg{,-db,-review}/` (lib/ncd is the separate decision-support engine). Migration 0093 GATED, applied by owner 2026-10-06; ADRs 0209–0214 proposed (were 0208–0213 before merge).

- NEVER put `.env.local` in this worktree: vitest loads it and tests/rls hit hosted Supabase. Run checks with `EMR_PGLITE=1 SKIP_ENV_VALIDATION=1`, tsc with NODE_OPTIONS=--max-old-space-size=6144.
- PGlite is a symlink from ~/Desktop/emr-harness; any `npm install` removes it (re-link `node_modules/@electric-sql/pglite`).
- Heavy gates need `NCDREG_HEAVY=1`; vitest buffers worker output, so set `NCDREG_PROGRESS_FILE=<path>` and tail it. Perf 2,054 persons ≈ 9 min; calibration ≈ 3.5 min.
- State 2026-10-05: all 15 adversarial findings fixed (65bd499); 51/51 requirements verified; perf 376/50/350 ms; calibration 35/38 (known gaps C07, H08 dialysis, H08 amputation). 0093 applied by owner 2026-10-06; owner closed S15, S23, S24, S26 (register R-01–R-04); 23 sign-offs open; PR #200 merged by owner 2026-10-06 (ADRs renumbered 0209–0214 on merge). PR #202 (0094 + ADR 0215: superadmin gets explicitly assigned NCD roles only) merged 2026-10-06; owner holds CSO + registry lead at a test hospital via ncd_staff_role. feat/ncd-colour (#204, incl. page guards) and feat/ncd-demo-progress (#205) merged 2026-10-08. Branch perf/ncd-speed pushed 2026-10-08 (vercel.json regions dub1 — Supabase is eu-west-1, functions were iad1; one-trip withNcd; parallel scope; app/ncd/loading.tsx), awaiting merge.

**How to apply:** for follow-up work read FINAL-REPORT §1 notes (untested parts) and §9–10 (open sign-offs). Related: [[medsync-owner-rules]] [[ncd-diabetes-pack-build]] [[emr-engine-build-state]]
