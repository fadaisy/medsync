---
name: pharmacy-demo-build
description: "26 Oct 2026 pharmacy demo button (national referral day, every pharmacy page) in ~/Desktop/medsync-pharmdemo on feat/pharmacy-demo; plan in docs/pharmacy/demo/PLAN.md; also the Interventions prod fix on fix/pharmacy-interventions-read"
metadata:
  node_type: memory
  type: project
  originSessionId: 4ddf4421-ab38-486b-baef-a5329fdbc02e
  modified: 2026-10-26T15:11:38.575Z
---

26 Oct 2026: the owner said the pharmacy demo must cover the WHOLE pharmacy workspace (the Phase 4 fixture pages were not what they meant): a database demo like the lab's, for a national referral hospital, inserted by one button. Answers: an existing test hospital marked as a demo (reuse `lab_demo_hospitals`); the button inserts everything, demo staff sign packs/content in demo hospitals only; doses read `[demo dose]`; national referral size. Worktree ~/Desktop/medsync-pharmdemo, branch feat/pharmacy-demo off origin/main 9bfd2d68; migrations 0250–0254, ADRs 0450–0454. The section status table in docs/pharmacy/demo/PLAN.md is the live progress record.

Same day: Clinical › Interventions crashed in prod because `queryFacts` joined hospital_departments inside `asClinicalReader` (the reader role has no grant on it). Fixed on fix/pharmacy-interventions-read in ~/Desktop/medsync-network (nameWards after the transaction, PGlite test in pharmacy-dispensing-data), uncommitted until the owner says.

Later 26 Oct: ALL 14 sections built (6 agents) and joined; full load 23 s on PGlite with no section stopping; button at /hospital-admin/departments/pharmacy/demo (maxDuration 300); ADR 0450 + CHANGELOG; docs/pharmacy/demo/HANDOFF.md is the owner's turn-on list. Not committed. The Interventions fix is copied into this worktree too. The demo found 3 more reader-role bugs (stewardship no courses, reaction detail on patient_profiles names, reconciliation on admissions); fixed the same day by reading those pages on the app connection behind the pharmacy scope (Phase 1 pattern, no migration), in both the demo worktree and fix/pharmacy-interventions-read (uncommitted).

Committed 26 Oct at the owner's word, pushed 27 Oct (no PRs yet): fix/pharmacy-interventions-read 2f6fd58d (the four clinical page fixes); feat/pharmacy-demo 4cd1a1da (same fix) + 653696e3 (the demo).

**Why:** owner wants presentable pharmacy pages to fill in and show.
**How to apply:** never fake legal answers ([[pharmacy-dev-hospitals]]); the owner applies 0250 and sets flags. Related: [[lab-demo-everywhere]], [[pharmacy-phase-4-build]].
