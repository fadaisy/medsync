---
name: lab-loading-states
description: "20 Oct 2026 lab loading states on feat/lab-loading-states (worktree medsync-loading), 02f9f917, not pushed"
metadata:
  node_type: memory
  type: project
  originSessionId: 2313d850-45b8-4078-989e-5e0b70684fad
  modified: 2026-10-20T11:26:06.563Z
---

Lab loading states built 2026-10-20 on `feat/lab-loading-states` (worktree `~/Desktop/medsync-loading`, based on
feat/lab-test-menu-v2), commit 02f9f917, not pushed, no PR. Skeletons per place, LabButton busy fix (dims, aria-busy,
"Working…" status), LinkPending on tabs/chips, picker transitions. Harness copy `~/Desktop/loading-harness`
(ports 4017/54347). Related: [[lab-test-menu-v2-build]], [[lab-workspace-v2-build]].

**Why:** owner said the lab "lacks loading states, very bad UX".
**How to apply:** merges after feat/lab-test-menu-v2 (it touches components/lab/test-menu/test-menu.tsx).
