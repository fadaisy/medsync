# ADR 0014 — Break-glass patient access

**Status:** Accepted (superadmin-workspace kickoff §4).
**Date:** 2026-05-24.
**Builds on:** ADR 0013 (superadmin as platform operator).

## Context

There are legitimate reasons a platform operator may need to see one
patient's record: a PDPO regulator request, a safety review after a
serious adverse event, a court order, an emergency where the affected
hospital's admin is unreachable. The wrong answer is "let the
superadmin browse." The right answer is a deliberately uncomfortable,
loudly-recorded action that exists _only_ for these moments.

## Decision

Decrypted access to a patient's record from the superadmin workspace
flows exclusively through **break-glass grants**:

- **Typed justification, required (≥ 16 chars).** Higher minimum than
  the 8-char reason bar elsewhere — opening PHI deserves more
  rationale than approving a staff affiliation.
- **One grant = one patient, one purpose.** No bulk patterns.
- **Time-boxed.** Default 15 minutes; per-grant configurable up to 60.
  Auto-revoke via the `/api/cron/sweep-break-glass` Vercel Cron
  (every 5 minutes; tighter than the drafts sweeper because grants
  carry PHI exposure).
- **Loudest `sa_audit_log` row.** Action `break_glass_open` /
  `break_glass_close`. The grant row carries the audit row's id as a
  hard FK (`ON DELETE RESTRICT`) so the proof is immutable.
- **Hospital-admin notification.** Insert into `sa_notifications` for
  every `hospital_admin` of the patient's primary facility, in-app
  for MVP. Email/SMS lands with the PHI phase.
- **Visible to the patient.** RLS on `sa_break_glass_grants` lets the
  patient see their own break-glass history (transparency principle).

## Decryption gating (PHI phase — not in this MVP)

When PHI decryption ships, `lib/encryption.ts` `decrypt()` will check:

> If the caller is a superadmin AND the column being decrypted belongs
> to a PHI-bearing table → require an active grant in
> `sa_break_glass_grants` for `(actor_id, patient_id)` within the
> time window. No grant → no decryption, full stop.

The MVP exercises everything _except_ the gate: opening + auditing

- notifying are all live and testable against fictional patient
  profiles. The gate flips on as soon as the decryption path lands.

## Alternatives considered

- **No break-glass; superadmin can never see PHI.** Rejected:
  legitimate use-cases exist (regulator, safety review, court order).
  A system with no break-glass forces those into out-of-band
  workarounds that are _less_ auditable.
- **Always-on superadmin PHI access with audit-only.** Rejected per
  ADR 0013. Audit-only makes browsing the default; break-glass makes
  intentionality the default.
- **Two-superadmin-required for every grant.** Considered. Decided
  against for MVP: emergency use needs a single-actor path; the audit
  loudness + hospital-admin notification + time-box give us the
  necessary accountability without paralyzing emergencies. Re-visit
  if break-glass volume ever indicates abuse.

## Consequences

- `/admin/break-glass` is the single PHI-touching surface in the
  workspace. Listed in the nav directly so the action is loud +
  intentional, never invoked from a routine workflow.
- The audit console highlights break-glass events with a teal accent
  - left border so they're impossible to miss when scanning.
- The five-minute sweeper cron keeps the open window minimised
  even if a superadmin forgets to manually close.
- PDPO conversation: "show me every time a platform operator looked
  at a patient record" is one filter on the audit console.
