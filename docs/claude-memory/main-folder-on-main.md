---
name: main-folder-on-main
description: "Since 2026-10-17 ~/Desktop/medsync is on `main` (lab Phases 0–3 merged); old booking-app leftovers are in a stash"
metadata:
  node_type: memory
  type: project
  originSessionId: 1d4ac69e-72fa-416b-8de7-fbd898491220
  modified: 2026-10-16T23:45:48.623Z
---

On 2026-10-17 the main folder `~/Desktop/medsync` was switched from `feat/booking-app` to `main` at 446a0cc9 (Lab
Phase 3 merged as PR #236, its signed copy as #237; pharmacy Phase 1 merged too). The owner now runs Claude Code from
the Claude app against this folder.

- The old uncommitted work (calendar draft, booking-app leftovers, untracked docs/emr and calendar tests) is in
  `git stash` as "main-folder snapshot before switching to main, 2026-10-17". It is probably stale: `main` already
  holds later versions of those files. Do not drop it without asking.
- `.env.example` keeps the owner's local edit (untouchable); `.claude/settings.local.json` untracked, left alone.
- Commit hooks: run `git commit` with `NODE_OPTIONS=--max-old-space-size=8192` or the pre-commit typecheck runs out of
  memory; commitlint types are feat|fix|chore|docs|security|style|refactor|test|perf|build|ci|revert (no `content`),
  header and body lines ≤ 100 chars.

Supersedes the "main folder dirty" notes in [[booking-app-build-state]] and [[schedule-reskin-build-state]].
Related: [[lab-phase-3-build]].
