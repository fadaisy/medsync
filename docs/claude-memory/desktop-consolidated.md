---
name: desktop-consolidated
description: "14 Nov 2026 the owner had every medsync-* Desktop worktree removed; only ~/Desktop/medsync remains, PGlite harness moved to ~/Desktop/medsync/.emr-harness"
metadata:
  node_type: memory
  type: project
  originSessionId: bbfeede9-e23f-4b14-8898-2d7c418c5084
  modified: 2026-11-14T11:03:06.043Z
---

On 2026-11-14 the owner asked for one medsync folder on the Desktop. Removed worktrees: medsync-fixes, -format, -hig,
-receive, -rx, -supplies (all branches kept locally and on GitHub). `~/Desktop/emr-harness` moved to
`~/Desktop/medsync/.emr-harness` (app/ and base/ copies dropped; pg/, shots, scripts kept), excluded in `.git/info/exclude`,
lint-ignored; every `node_modules/@electric-sql` symlink repointed (commit 66a8b5e4 on feat/pharmacy-main-store).

**Why:** owner wants a clean Desktop with only the main folder.

**How to apply:** don't create new sibling worktrees on the Desktop; use `.claude/worktrees/`. Older memories naming
`~/Desktop/emr-harness` or `~/Desktop/medsync-*` folders are stale. Related: [[main-folder-on-main]].
