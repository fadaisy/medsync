---
name: pharmacy-catalogue-build
description: "Shared medicines catalogue slice — worktree medsync-catalogue, feat/pharmacy-catalogue; Steps 1–11 committed ed9c1836 and pushed 27 Oct 2026, PR #267 open; Step 12 is the owner's pilot"
metadata:
  node_type: memory
  type: project
  originSessionId: 4ddf4421-ab38-486b-baef-a5329fdbc02e
  modified: 2026-10-27T19:45:37.861Z
---

Shared medicines catalogue + stocking rework (brief PROMPT-PHARMACY-CATALOGUE, copy in docs/pharmacy/catalogue/).
Worktree ~/Desktop/medsync-catalogue on feat/pharmacy-catalogue (cut from Workspace v2 576f6018). Committed as ed9c1836 on 27 Oct 2026 (153 files), pushed to origin 27 Oct 2026; PR #267 (justfadhul/medsync) opened 27 Oct 2026.

- GATE A was signed by Fadhul (CSO) with fallbacks O-1 to O-7. Owner answers: A-1 "Catalogue key"; D-CAT-18 "Refuse for now".
- Steps 1–11 are done. Each STOP report, with its checks, is in docs/pharmacy/catalogue/STOP-REPORTS.md. Step 12 needs the owner's pilot.
- Migrations 0251–0259 are GATED and unapplied: 0256 delivery, 0257 prices, 0258 imports, 0259 distribution.
- Flag `PHARMACY_CATALOGUE`.
- ADRs 0456–0467: 0460 prices, 0461 billable lines, 0462 imports, 0463 picks, 0464 ward use, 0465 seals, 0466 map, 0467 receiving.
- Known lane failures predate this work: parity location_shares and appointment_attachments, and golive S83.
- S6 (search p95) fails only when run beside a typecheck.
- Never run two typechecks at once. Another session's tsc in medsync-pharmws2 also slows this one.

**Why:** the next session must not redo the gates or apply the migrations.
**How to apply:** read STOP-REPORTS.md first. Commit only when asked, never `.env.example`. The owner applies 0251→0259 in order from this worktree. See [[pharmacy-workspace-v2-build]] and [[medsync-owner-rules]].
