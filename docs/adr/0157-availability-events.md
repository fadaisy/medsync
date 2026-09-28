# ADR 0157 — Availability is an append-only event log with a projection

**Status:** Accepted — 2026-09-26. Signed under the owner's blanket GATE A sign-off (Fadhul, CSO and owner). Spec: `docs/hospital-services/gate-a-proposal.md`.

## Context

"The ultrasound is down" must reach ordering, booking and referrals, must never block a clinician, and must not silently go stale.

## Decision

- **`availability_events` is append-only** (`block_modify_append_only`).
  - Events: reported, updated, resolved, confirmed.
  - State: unavailable or limited.
  - Reason: from a fixed list; "other" requires a note.
  - Each event carries an optional expected-back date.
- **`projectAvailability` is pure.** It folds events into open problems. A problem whose expected-back date has passed without confirmation shows as **"Unconfirmed — check"** (AV-2), never as fixed.
- **Availability now** merges open problems with temporarily closed wards and closures that cover today (AV-3). The header count and the amber nav badge read the same function.
- It is information only. `getOrderingAvailability` returns it to ordering and booking, and nothing refuses an order because of it.

## Consequences

- Hospital admins and heads report problems. Ward in-charge reporting is a seam (D-SVC-12 Δ).
- History is kept for 90 days in the view and forever in the log.
