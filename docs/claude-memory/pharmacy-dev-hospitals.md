---
name: pharmacy-dev-hospitals
description: PHARMACY_DEV_HOSPITALS env (ADR 0394, 25 Oct 2026) gives listed test hospitals pharmacy map v2 in production; legal answers deliberately NOT faked; unset before go-live
metadata:
  type: project
---

25 Oct 2026: the owner wanted the six Phase 1 legal questions "answered just for development". I refused to write made-up rows into `pharmacy_legal_answers` (it would falsify the legal record and later unlock real points). Instead: `PHARMACY_DEV_HOSPITALS` ("1" = every hospital since the same-day amendment, or comma-separated ids) makes `dispensingMap` return v2 in production for those hospitals only (commit 46d351c4 on feat/pharmacy-clinical). Test-hospital points go live by fixture SQL (`live_at`), as the Phase 1 plan allows.

**Why:** D-PH1-03 keeps production view-only until legal Q1 is answered; the owner chose to keep that gate for real hospitals and to involve lawyers later.
**How to apply:** before any real go-live, remind the owner to unset PHARMACY_DEV_HOSPITALS and to record the six legal answers, the same as [[dev-skip-mfa]]. Never list a hospital that treats real patients.
