---
name: lab-phase-0-build
description: "Lab Phase 0 (front door) build — worktree medsync-lab0, branch feat/lab-front-door; ALL STOPs done (0–5), local only, not pushed or merged"
metadata:
  node_type: memory
  type: project
  originSessionId: 44d08942-204c-4711-bfca-7c3ed3a4a539
  modified: 2026-10-10T15:54:33.497Z
---

Prompt docs/lab/phase-0/PROMPT-LAB-PHASE-0.md. Worktree ~/Desktop/medsync-lab0, branch feat/lab-front-door from origin/main 4087e4c. As of 2026-10-10 all of STOP 0–5 are committed (head 29dc006), with migration 0097 (lab access trigger) and ADRs 0221–0226. The notice wording was signed by the CSO. The branch is local only: **not pushed, not merged to main**. Harness ~/Desktop/lab0-harness (PGlite + app + headless Chrome over CDP).

Owner items before go-live: apply 0097, run `npm run lab:backfill-access`, set LAB_WORKSPACE for Test Hospital-1 first.

**Why:** Pharmacy Phase 0 depends on its access model, resolveLanding, nav registry, notice and flag ([[pharmacy-phase-0-build]]).
**How to apply:** check `git log origin/main` before assuming it merged. Typecheck needs NODE_OPTIONS=--max-old-space-size=8192; tests need SKIP_ENV_VALIDATION=1. Related: [[lab-signup-department]].
