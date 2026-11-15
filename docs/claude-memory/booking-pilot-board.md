---
name: booking-pilot-board
description: 12 Nov 2026 booking pilot-readiness program — a main chat runs nested sessions and keeps a Data-type progress board; how to update it
metadata:
  node_type: memory
  type: project
  originSessionId: d18c2203-42cf-4792-8337-95bebb044ef0
  modified: 2026-11-12T10:35:34.871Z
---

Owner (12 Nov 2026) made one chat the "main chat" for getting MedSync Book pilot-ready (about 5 private clinics, 30 days, web first), with nested sessions per task and a Claude dashboard showing their progress.

- Board: https://claude.ai/artifact/7wgK9QPzCKvwqi5cNSZydE (Data type). One dataset `tracks` = file asset of `~/Desktop/medsync/.claude/pilot-board/tracks.json` (rows: id, area Claude|You, task, status Queued|Running|Needs you|Done|Blocked|Not checked|Later, progress, branch, note, updated).
- To update: edit tracks.json → Artifact publish `asset: true` with the board url → ArtifactData `update` datasets/tracks with the new `source.url` (/_blob/…), `updated: {at, by}` and `edit: {via: "claude", at}`. The main chat is the only writer; sessions report back to it.
- First round proposed as cards 12 Nov: security (finish review findings C-3, H-8, H-7 processors on fix/review-perimeter in ~/Desktop/medsync-fixes), dry run (walkthrough end to end, branch off origin/main), go-live (15-min reminder cron, which needs Vercel Pro before it reaches main, plus docs/booking-pilot/GO-LIVE.md). Next round: per-clinic pilot metrics, clinic set-up kit.
- Owner-side rows (legal/PDPO, hosting Pro + staging, Africa's Talking sender ID, emergency numbers, 5 clinics) are "Not checked" until the owner says.
- A read-only prod DB probe was refused by the auto-mode classifier (Production Reads); ask the owner for DB facts instead.

**Why:** the October launch plan (https://claude.ai/artifact/65W5peeezjoavdt1jpEHMW) put booking first; the 11 Nov senior review says no real patient data until the perimeter is fixed.
**How to apply:** after each nested session reports, check its branch, then update its row on the board.

Related: [[booking-launch-tasks]], [[review-fixes-build]], [[feedback-deploy-once]], [[medsync-owner-rules]].
