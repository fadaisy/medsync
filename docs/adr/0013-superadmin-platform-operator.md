# ADR 0013 — Superadmin as platform operator (not super-hospital-admin)

**Status:** Accepted (superadmin-workspace kickoff §1, principle 1).
**Date:** 2026-05-24.

## Context

MedSync's superadmin is the most powerful role in the system. The natural
shape of the workspace would be to let that role browse anything — every
hospital's roster, every patient's record, every approval — because
technically it can. The cost of that shape is a credibility one: the
moment the superadmin can casually open a chart, tenant isolation stops
being a real boundary for patients and regulators, and the platform
inherits the "trust us" posture instead of an architectural one.

## Decision

The superadmin runs the **platform**, not the wards.

- Approvals, tenants, catalog, audit, health, people: yes. These are
  legitimate operator surfaces.
- Day-to-day clinical work: no. The workspace never decrypts patient
  data as a side effect of any action. Approval rows show licences and
  council numbers (the operator's job) — never patient charts.
- The only path to a decrypted patient record is **break-glass** (ADR
  0014): explicit, typed-justification, time-boxed, loudly audited,
  and notified to the affected hospital's admin.

This is enforced at multiple layers:

1. **RLS policies** keep clinical tables (`patient_profiles`, future
   PHI tables) restricted to the patient themselves + scoped care-team
   roles. Superadmin appears in those policies only via the explicit
   `public.user_has_role('superadmin')` clause where it's required for
   oversight (e.g. break-glass grants table), never as a blanket
   "superadmin sees all."
2. **Application gating** in `lib/encryption.ts` (PHI phase): the
   decrypt() path will check for an active `sa_break_glass_grants` row
   when the caller is a superadmin and the requested column is encrypted.
3. **UI absence**: the workspace's six capability areas (approvals,
   tenants, people, catalog, audit, health) have no surface that lists
   patient records. The only PHI-touching screen in the entire
   workspace is `/admin/break-glass`.

## Alternatives considered

- **"Superadmin is a god-mode browser."** Rejected: violates principle
  1 of the kickoff. Erodes the tenant-isolation contract that hospitals
  and patients expect.
- **"Hide the superadmin's powers behind a `requires_step_up`."**
  Rejected as a substitute (it's a complement). Step-up is a friction
  control on already-permitted actions; the platform-operator decision
  is about _which actions exist at all_.

## Consequences

- The workspace is smaller than it could be — and that's a feature.
- Adding a new feature triggers the question "does this need to see
  PHI?" before "how do we build it?" If yes → break-glass or PDC
  research path. If no → operational metadata only.
- The PDPO audit conversation becomes easier: the very small list of
  places PHI is touchable is explicit and reviewable.

## Status of implementation (this kickoff)

- All six capability areas built MVP-or-deferred per the kickoff split.
- Catalog editing (especially role→permission mapping) intentionally
  deferred — it's the quietest catastrophic risk and lands only with
  preview + four-eyes + audit safeguards in place.
- Tenant suspend/deactivate deferred behind four-eyes wiring.
- Break-glass scaffolded with audit + notification (PHI decryption
  gating arrives in the PHI phase per ADR 0014).
