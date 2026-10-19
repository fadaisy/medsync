# ADR 0354 — Catalogue requests, not free-text tests

**Status:** Accepted — 2026-10-19 (TM-11, TM-D08).

## Decision

- `lab_catalogue_requests` (0171): the hospital asks; the MedSync catalogue team (superadmin) works the queue at
  `/admin/lab-catalogue-requests`: in review, added (naming an active catalogue test, after a signed addendum) or
  declined (with a reason, enforced by a check constraint).
- The requester sees the state and reason under the form. Hospital numbers, lab numbers and long digit runs are
  refused (§9).
