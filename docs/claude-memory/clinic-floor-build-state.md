---
name: clinic-floor-build-state
description: "Tether clinic floor (triage station, clinic line, floor board, waiting screen) built 13 Nov 2026 on feat/clinic-floor; local only"
metadata:
  node_type: memory
  type: project
  originSessionId: 91821fa2-c350-48f5-b8fb-c7d1f4b39f77
  modified: 2026-11-13T19:13:51.205Z
---

Clinic floor built through STOP 8 on 13 Nov 2026 in worktree `.claude/worktrees/clinic-floor-4f4be4`, branch `feat/clinic-floor` (cut from feat/reception-desk). Commits f869690a (STOP 2), de1258dc, 273f7907, 1e8fdb8d. Not pushed, not deployed. Flag `CLINIC_FLOOR`.
15 Nov: main merged in, `/clinic` opened on the Tether domain (TETHER_OPEN), branch pushed at 85d3dc42 for a PR to main; owner merges, applies 0295, deploys, sets CLINIC_FLOOR.

- Migration 0295 GATED, unapplied. ADRs 0491–0497. Copy + trend bands draft.
- Read `docs/clinic-floor/REPORT.md` first (open items: SpO₂ scale 2 + pregnancy not asked on the floor → keep /nurse/triage until added; follow-up booking, lab release, past readings, age/sex not linked live; parity map unsigned; pilot/cut-over is the owner's).
- Browser checks: dev server on `floor.localhost:<port>` (localhost gives 431, 127.0.0.1 blocks hydration).

**Why:** the brief (docs/clinic-floor/PROMPT.md) runs gated steps; the owner signs as CSO in chat ([[feedback-cso-signoff-in-chat]]).
**How to apply:** continue from REPORT §Open; never apply 0295 or push without the owner's word ([[medsync-owner-rules]]).
