# ADR 0034 — Book-or-Queue: patient-initiated intake is a status, not an entry type

**Status:** Accepted — pending sign-off (2026-05-30)
**Context:** Per `prompts/book-or-queue-kickoff.md` + `docs/book-or-queue-gate-a-proposal.md`. After a patient selects their primary hospital we offer two clear next actions — **Book a future visit** (existing scheduling) or **Join today's queue** (new, but reuses existing entry-points pre-queue). This ADR captures the load-bearing decisions made during the build.

## Decisions

### 1. Patient-initiated declaration = `patient_intakes.status='declared'`, not a new entry type

The kickoff distinguishes **declared** (patient said "I'm coming today") from **arrived** (physically present). Two ways to model this:

- (A) New `patient_intakes.entry_type_code='patient_declared'` + new RLS / queries / boards
- (B) Reuse `entry_type_code='walk_in'` (already in the migration 0032 taxonomy), add a new value to `patient_intakes.status` enum — `'declared'`

**We chose (B).** Walk-in **is** what's happening — the patient is declaring a walk-in before they arrive. The "not here yet" semantic lives in `status`, not in the entry type. Consequences:

- Existing entry-type aggregates (admin "walk-in mix today") roll up patient-declared rows naturally — no double-bucketing
- Every existing query that filtered on `entry_type_code='walk_in'` continues to work unchanged
- The only schema delta is: status enum + two columns (`checked_in_at`, `declared_by_patient`) + one widened index predicate. Cheaper to land, cheaper to reason about, cheaper to roll back if needed

The `declared_by_patient boolean` flag is the audit trail for _how_ the row got created. We could have inferred from `registered_by_user_id = patient_user_id` but an explicit flag is clearer and safer — admin-of-patient-records or future invite-flow paths might also self-author.

### 2. "Open for walk-in today?" reuses `departmentSchedulingPolicy`, NOT a new flag

We considered adding `hospital_departments.accepting_walkins boolean` or `departmentSchedulingPolicy.accepting_walkins boolean`. Rejected for this gate. Instead the heuristic is:

> A department is "open for walk-in today" iff it has a `departmentSchedulingPolicy` row AND today's weekday is in `bookableWeekdays` AND current local time is inside `[bookableStartMinutesLocal, bookableEndMinutesLocal)`.

Rationale:

- Almost all departments that take patients ALSO take bookings, so the booking policy already declares operating hours. Inventing a parallel walk-in flag would have created two sources of truth that admins must keep in sync — and which would be ignored, then drift, then mislead patients
- Departments without a policy row read as "closed for walk-in" — honest fallback, surfaced as _"This department isn't accepting same-day visits today — you can book a future appointment instead"_ with a link to `/patient/book`
- If a future tenant genuinely needs "we have booking hours but no walk-ins," that's the trigger to add the explicit flag — additive, deferred (out of this gate)

Both the Edge Function (`pt-declare-intake`) and the patient UI (`/patient/queue`) apply the **same heuristic** — there's never a case where the form lets a patient pick a dept the server would reject. The picker disables closed depts with a one-line _why_ underneath each.

### 3. Patient-side writes via `pt-*` Edge Function — same auth + audit shape as `pt-request-appointment`

`pt-declare-intake` mirrors `pt-request-appointment`:

- Auth: caller is the patient themselves; `hospital_id` MUST match `patient_profiles.primary_facility_id` (no cross-hospital declarations, same boundary as booking)
- Audit: `sa_audit_log` action `'patient_declare_intake'` with `target_kind='patient_intake'`; failure to audit aborts the write
- 409 envelopes carry `details` (existing_appointment_id / existing_intake_id) so the UI can offer a direct link to the right destination instead of just an error message — this is the new pattern for "conflict with structured follow-up"

Reception's existing `ha-check-in-patient` Edge Function was extended (not duplicated) to also accept `intake_id`, branching internally. Same auth, same audit, no new staff-side dispatch. The Edge-Function-per-action surface stayed small.

### 4. Reconciliation: same-dept-today booking trumps a new queue ticket

If a patient has any live appointment today at the same department they're trying to queue for, `pt-declare-intake` rejects with 409 + the existing `appointment_id` in `details`. UI surfaces _"You already have a booking at HH:MM today — check in when you arrive"_ and links to `/patient/appointments`.

Different-dept-today bookings are **allowed** to coexist with a queue ticket. The kickoff §3 is explicit: "presence is per-event already; no collision." A patient booked into Cardiology at 14:30 can still queue for Pharmacy this morning.

Walk-ins-after-booking-today are reception's job, not the patient's: when the booked patient physically arrives, reception uses the existing **appointment** check-in (`ha-check-in-patient` with `appointment_id`), which already inserts the intake row as `booked_arrival`. No duplicate path.

### 5. Patient self-cancel only while `declared`

`ha-cancel-intake` was extended so the patient may cancel their **own** intake row while it's still `declared`. Once `arrived`, only staff can close — a patient walking away after check-in is operationally a no-show, which is reception's call, audited. This keeps the patient in control of their own pre-arrival commitment without giving them a path to invalidate staff observations.

### 6. Position-in-line is the only count surfaced, by design

We do **not** surface an estimated wait time. We have no signal that would make that estimate honest — clinician throughput varies, triage re-orders, emergencies pre-empt. The patient sees _"12 ahead right now"_ and _"the team will see you in turn"_ — accurate, unsensational, and never wrong because it makes no prediction.

Real-time updates are a 30-second `meta http-equiv="refresh"` until the websocket path lands. That's the honest minimum — the patient sees current position without a stale-by-default UI.

## Consequences

**Positive:**

- Cleanly distinct from booking everywhere — patients understand the choice, staff see at a glance which patients are physically present vs declared
- No new tables, no new RLS, no new entry-type — the smallest possible delta that makes the feature real
- Reuses every existing audit / scope / state-machine guarantee from migration 0032

**Negative / risks:**

- The "open for walk-in today" heuristic conflates booking-hours with walk-in-hours. A department that wants different windows for the two has no way to express that today. Mitigation: additive `accepting_walkins` flag is a small follow-up if asked for in pilot
- 30s meta-refresh is a full reload — fine for now, but websockets are the right end-state. Tracked.
- A patient declaring at the very end of walk-in hours could theoretically arrive after the dept closes. We accept this as honest behaviour — the dept's closing time isn't enforced as a hard ticket-expiry, since reception still owns the call to check in or cancel anyone.

## Related

- Migration 0035 (`patient_intakes.status` + columns)
- `prompts/book-or-queue-kickoff.md`
- `docs/book-or-queue-gate-a-proposal.md` (the GATE A wire-up proposal this ADR formalises)
- `supabase/functions/pt-declare-intake/index.ts`
- `supabase/functions/ha-check-in-patient/index.ts` (extended)
- `supabase/functions/ha-cancel-intake/index.ts` (extended)
