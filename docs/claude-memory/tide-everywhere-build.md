---
name: tide-everywhere-build
description: "PROMPT-TIDE-WEB-MIGRATION — GATE A signed 21 Oct 2026; foundation+shells committed 88a1195d on feat/tide-everywhere (worktree medsync-tideweb), not pushed; behind TIDE_SURFACES"
metadata:
  node_type: memory
  type: project
  originSessionId: 4ddf4421-ab38-486b-baef-a5329fdbc02e
  modified: 2026-10-21T02:24:21.000Z
---

Worktree ~/Desktop/medsync-tideweb, branch feat/tide-everywhere from origin/main 7c704780. Owner signed D-TW-01..13 + D-TW-14 (CDP harness + axe, no Playwright) + D-TW-15 (TIDE_SURFACES env flag, re-pin method) + DESIGN-medsync.md rewrite, 21 Oct 2026.

Method: `:root:has([data-ds="tide"])` reuses the lab's re-pin block; `<TideScope group>` in every route-group layout; `.medsync-btn` class on buttonVariants; `medsync-rail` on SIDEBAR_CLASS; Help wording draft in content/tide.ts. ADRs 0360–0361 (0360–0366 claimed). Records: docs/design/tide-everywhere/{gate-a-proposal,STOP-REPORTS}.md.

Green: suite 10,949, build, axe 0 on pharmacy + public (harness: HARNESS_MIGRATIONS=<worktree>/supabase/migrations needed; SRC=<worktree> ./sync.sh).

Open: per-screen kit conversion (37 native-date files, ratchets in tests/design/tide-guards.test.ts), 88px icon rail, screenshots/parity for other groups, pilot, Step 10 deletion. Related: [[lab-workspace-v2-build]], [[mobile-tide-v1-build]].
