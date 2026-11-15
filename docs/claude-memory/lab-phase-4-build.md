---
name: lab-phase-4-build
description: "Lab Phase 4 (connect outward) DONE 17 Oct 2026 on feat/lab-connect-outward (pushed); 0150-0153 applied; copy signed; ADR 0327 countersigned; hazard scores still unsigned"
metadata:
  node_type: memory
  type: project
  originSessionId: 26375173-6b35-4f62-bb25-61ba6503338b
  modified: 2026-10-17T13:03:34.834Z
---

Lab Phase 4 (referrals, results back, exchange core) finished all 13 steps on 17 Oct 2026, on branch
`feat/lab-connect-outward` in ~/Desktop/medsync itself (not a worktree). Pushed to origin (no PR yet); signatures pushed (0a872a51).
Steps 9, 10 and 11 are gap reports (no partner interface, no analyser maker's document, no NHLDS spec).

- Migrations 0150 → 0153 APPLIED by the owner (17 Oct 2026). Phase 4 copy signed by the CSO in 6760ed5a. 0153 adds `private.schedule_exchange_outbox(url)`.
- ADRs 0312–0327 used (0328–0329 spare); migrations 0154–0169 spare. ADR 0327 (referred critical = "checked, not
  repeated") countersigned by the CSO, 17 Oct 2026.
- GATE S S-5 rate limit on /api/exchange/pair and /token DEFERRED (needs Vercel Pro); do before any machine goes live.
- Read `docs/lab/phase-4/FINAL-REPORT.md` first: owner actions in order, the CSO questions (stricter MA-1, duplicate
  form numbers at Add to manifest).
- Screen harness at ~/Desktop/lab4-harness (`./start.sh`, `node cdp.mjs plans/p4.json`); it seeds through the app's
  stores via vitest in its app copy, and the `hx` cookie picks the user. Phase 4 PGlite lanes:
  tests/emr-db/lab-{referral,exchange,phase4-data}.test.ts.

**Why:** the next session needs to know where Phase 4 stands without re-reading 13 STOP reports.
**How to apply:** ask before pushing; never apply the migrations yourself ([[medsync-owner-rules]]). The MedSync mod
blocks a capitalised name next to an ISO date (it reads it as a patient), so write dates as "17 Oct 2026" in
docs. Continues [[lab-phase-3-build]].
