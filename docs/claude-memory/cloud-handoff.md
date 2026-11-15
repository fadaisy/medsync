---
name: cloud-handoff
description: "docs/CLAUDE-HANDOFF.md on origin/main is the shared state between local and cloud sessions; read it from git, the main folder's checkout is older"
metadata:
  node_type: memory
  type: reference
  originSessionId: ccf89396-859f-4c0c-992f-aed7c6606248
  modified: 2026-10-08T06:17:11.915Z
---

`docs/CLAUDE-HANDOFF.md` (read with `git show origin/main:docs/CLAUDE-HANDOFF.md`) is where cloud sessions record build state, applied migrations and open owner items. Last updated 2026-09-30 (0090 applied; next migration 0091). Cloud work after that (PRs #193–197: rx/dx "Show all" browse dialogs, ward plan zoom, rotate/multi-select) is merged but not recorded in it.

As of 2026-10-03: main folder is still on `feat/booking-app` @ e58e06e (96 commits behind origin/main, an ancestor of it). Unmerged: `claude/dx-browse-dialog` (+ICD-11 `claude/beautiful-dijkstra-8ydpwk`, PR #188).

2026-10-08 audit: origin/main @ 20cf337 (PR #209) holds every branch's content, dx-browse-dialog included. The leftovers are deliberately not pushed: the main-folder calendar files (pre-Chroma draft), the medsync-release package.json (accidental downgrade), and .env.example.
Worktree `~/Desktop/medsync-main` (own npm ci install; on 2026-10-09 checked out as branch fix/tab-account-guard 31d124c, pushed, owner opens PR; commit hook needs NODE_OPTIONS=--max-old-space-size=8192 or tsc OOMs) was made 2026-10-08 so the owner can run `db:migrate` against main's migrations. Owner dry-run 2026-10-08: prod has every migration through 0094 (0091 included; records were stale). Reading the prod ledger is blocked for Claude, so ask the owner for a dry-run. Owner deployed all Edge Functions from main 2026-10-08; Vercel prod was already on 20cf337 (medsync-e53u16npi, a redeploy of the main git deploy): Vercel auto-deploys main on merge, check with `vercel inspect`. prod = main.

**How to apply:** at session start, check that file and `git log --first-parent origin/main` before trusting older build-state memories. Related: [[release-state]] [[schedule-reskin-build-state]]
