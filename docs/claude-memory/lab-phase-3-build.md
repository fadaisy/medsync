---
name: lab-phase-3-build
description: "Lab Phase 3 (quality, registers, HMIS 105) merged to main 2026-10-16/17, migrations applied, copy signed"
metadata:
  node_type: memory
  type: project
  originSessionId: 1d4ac69e-72fa-416b-8de7-fbd898491220
  modified: 2026-10-16T23:49:50.420Z
---

Lab Phase 3 is on `main`: PR #236 (feat/lab-quality-registers) and PR #237 (the CSO's signature of `LAB3_COPY_STATUS`,
16 Oct 2026). Migrations 0112–0118 applied by the owner. ADRs 0300–0311 (0312–0319 spare). The build worktree
`medsync-lab3` was removed 2026-10-17; work now happens in the main folder ([[main-folder-on-main]]).
Final report: docs/lab/phase-3/FINAL-REPORT.md (18 gaps, owner actions).

- Eight flags LAB_STOCK … LAB_HMIS, rollout order D-LAB3-27; owner set flags for Test Hospital-1.
- Still open (owner): HMIS 105 rows unverified until the printed form / eHMIS export + ids (OA-1, OA-2) — can wait
  until before LAB_HMIS; designate In-Charge and focal person; sign hazard log, user guide, permission map v2; the
  lab lead's sign-off packs; parallel month; timed trials; DEV_SKIP_MFA off before go-live.
- Signed items reuse `lab_signed_configs` kinds; machines = widened `devices`; the lab harnesses were deleted 2026-10-17.

**Why:** the owner asked to run the Phase 3 prompt through every step with Claude's recommendations as decisions.
**How to apply:** the CSO signs copy himself (Claude is blocked from editing signed status); ask before pushing.
Related: [[lab-phase-2-build]], [[medsync-owner-rules]].
