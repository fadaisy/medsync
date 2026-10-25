# ADR 0394: A development override for named test hospitals in production

**Status:** Accepted, 25 Oct 2026, by the owner (Fadhul, CSO). This is a development decision, **not a legal answer.**

## Context

D-PH1-03 keeps permission map v1 (view only) in production until legal question 1 has an interim written answer. RD-1 condition 2 keeps every point off until legal questions 1–6 have answers on record. None has been answered yet.

The owner wants to develop and test on the production deployment at the test hospital before involving lawyers. Recording made-up answers in `pharmacy_legal_answers` would falsify the legal record, so that is not done.

## Decision

- **`PHARMACY_DEV_HOSPITALS`** takes a comma-separated list of hospital ids. In production, map v2 applies only to the hospitals it lists; every other hospital keeps v1. There is no "all" value. (`lib/pharmacy/access.ts`, `dispensingMap`)
- **Points go live by fixture.** At a listed test hospital, a point is made live by a fixture (a direct `live_at` update run by the owner), as the Phase 1 plan already allows. It is never done through the go-live page.
- **Nothing else changes.**
  - `pharmacy_legal_answers` stays empty.
  - RD-1 condition 2 still blocks every real point.
  - The legal questions stay open.

## Rules

- Only test hospitals with fixture patients are listed, never a hospital treating real patients.
- Before any real go-live, unset `PHARMACY_DEV_HOSPITALS` and record the six legal answers. The same go-live checklist item applies to `DEV_SKIP_MFA`.

## Amendment, 25 Oct 2026

At the owner's request, `PHARMACY_DEV_HOSPITALS=1` now means every hospital in production, so the owner can see the pharmacy working everywhere during development. A list of ids still works as before. The rule above still holds: unset it before any hospital treats real patients.
