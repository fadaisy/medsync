# Patient Handling Flow — GATE A Proposal

> **Status: Awaiting Caroline / Usama sign-off.** Triage is the next build — this design hands off cleanly to `awaiting_triage` and ships no acuity logic.
>
> Two clinical-safety / governance calls flagged for sign-off: the **reception role's non-clinical scope** (§4) and the **lifecycle write paths that close intake + encounter** (§6).

## 1. Reuse vs net-new — the headline

| Piece                                                                                                                 | Status                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `patient_profiles.primary_facility_id` as the durable Layer-1 signal                                                  | **Reuse** — already the canonical "care home" column. Surface it on the hospital side.                                          |
| Scheduling, queue, intake, nursing assignments, doctor + nurse + hospital-admin shells                                | **Reuse** — these ARE Layer 3. We add lifecycle writes + a thin shared presence helper, not new tables.                         |
| `clinical_phi_access_log` + audited-decrypt pattern                                                                   | **Reuse** — extended to cover hospital-admin + reception PHI reads.                                                             |
| Hospital-admin overview snippet pattern (per-feature `_components/<name>-overview-card.tsx` + locally-defined `Stat`) | **Reuse** — `FlowOverviewCard` follows the same convention.                                                                     |
| `ha-register-intake`, `ha-mark-arrived`, `ha-record-walkin`, `ha-start-encounter`                                     | **Reuse** — the entry-points and scheduling Edge Functions ALREADY do most of the work; the reception role gets auth into them. |

**Net-new in migration 0033 — additive only:**

| Schema delta                                                                                                                | Why                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Widen `user_roles_role_check` to add `'reception'`                                                                          | The Layer-4 role needs a row in `user_roles`.                                                                                                                                                                                   |
| Add `cadres.is_clinical` boolean (default true)                                                                             | Lets non-clinical cadres coexist in the same catalogue without dragging council credentialing into the signup form. Existing cadres stay `is_clinical = true`.                                                                  |
| Seed `RECEPTION` cadre row + a `RECEPTION_OFFICER` role row                                                                 | The reference data the new signup path needs. **No new council.** Council stays NULL for non-clinical cadres (today `clinician_profiles.councilId` is the link; reception staff get no `clinician_profiles` row at all).        |
| Add `patient_profiles_select_by_primary_hospital` RLS policy                                                                | `hospital_admin` + `reception` at hospital H may SELECT minimal columns of `patient_profiles WHERE primary_facility_id = H`. **Encrypted columns stay gated** (the existing patient-self / superadmin policy still owns those). |
| Add `clinical_observations`/`medication_administration_records`/`encounters` deny-policy for `reception`                    | Defence-in-depth — even if a reception user somehow holds a stale staff_affiliations row (they won't; affiliation FK keeps them in their own track), they cannot read clinical content.                                         |
| Add `patient_intakes.encounter_id` (nullable FK to `encounters`)                                                            | Closes the intake→encounter chain so visit history can traverse it.                                                                                                                                                             |
| Widen `patient_intakes_status_check` with `'completed'`                                                                     | The terminal state that drops the intake off the awaiting-triage panels.                                                                                                                                                        |
| Add `encounters.completion_reason` text                                                                                     | Drives the patient visit-history "why it ended" line + the drop-off rule.                                                                                                                                                       |
| Widen `sa_audit_log` actions with `complete_encounter`, `cancel_intake`, `check_in_patient`, `admin_view_patient_directory` | The new audited verbs.                                                                                                                                                                                                          |

**Net-new code:**

- Edge Functions: `ha-complete-encounter`, `ha-check-in-patient` (thin wrapper around `ha-mark-arrived` that also writes a `patient_intakes` row for the booked-arrival case), `ha-cancel-intake`.
- `app/signup/reception` — the non-clinical signup route (admin-invite-driven; no licence step).
- `app/reception/*` — the thin reception workspace: expected-arrivals · check-in · register-entry (reuses `/hospital-admin/intake` form) · route · search.
- `app/hospital-admin/patients` — Layer-1 "patients known to us" directory.
- `app/hospital-admin/_components/flow-overview-card.tsx` — the admin Flow snippet.
- `lib/handling/presence.ts` — shared typed helpers returning a unified `PresenceEvent` shape that `/doctor`, `/nurse`, `/reception` boards consume. **Not a new table** — a UNION over the four existing source tables with the staggered-presence rules from §3 explicit and centralised.
- `lib/patient/visit-history.ts` — UNION of (completed encounters · completed intakes · past appointments without a backing encounter), keyed by patient_user_id. Rewires the Past section on `/patient/appointments` and fills `/patient/care`.

## 2. The three layers, plainly stated

- **Layer 1 — relationship (durable, quiet).** `patient_profiles.primary_facility_id`. A patient setting their primary hospital is now visible to that hospital's admin + reception in a searchable directory. It is **not a worklist**. New RLS policy: `(hospital_admin | reception)` at hospital H may SELECT minimal patient columns where `primary_facility_id = H`. PHI columns stay gated; opening a patient triggers an audited decrypt via the existing pattern.

- **Layer 2 — events.** The four event types the kickoff names map exactly to the four existing tables, so we don't invent a new event log:
  - Booked appointment → `appointments` row.
  - Arrival / entry → `patient_intakes` (+ `queue_entries` for the physical-queue cases).
  - Urgent alert → `appointments` with `priority='urgent'` + `triggered_by_alert_id` (existing seam).
  - Assignment → `nursing_assignments` (nurse) or `care_team_members` (future — care-team module).

- **Layer 3 — staggered presence.** A typed helper, `listPresenceForRole(role, scope)`, UNIONs the four tables with explicit per-stage rules (§3 below) and returns a unified `PresenceEvent[]` shape. Each role's board renders the slice that's its job to act on, never the whole patient panel of the hospital. **No new presence table** — the existing rows ARE the presence; the helper is the place where "what counts as present right now, on whose board" is centralised.

## 3. The staggered-presence rules (the read contract)

| Stage / trigger                                      | Event row that exists                                                                                              | Renders on…                                                                                                                    | Falls off when…                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Booking created                                      | `appointments.status IN ('confirmed','pending_approval','requested')` with `starts_at >= today`                    | clinician's `/doctor/schedule` calendar; reception's expected-arrivals (today only)                                            | `status` flips to `arrived` (stage advances) OR `cancelled/declined/no_show` (drops off)                            |
| Check-in (booked arrival)                            | `appointments.status='arrived'` + `patient_intakes(entry_type='booked_arrival')` + `queue_entries.state='waiting'` | reception's "checked in today"; nurse's incoming-intake panel; doctor's incoming panel; `/hospital-admin/intake` awaiting list | triage flips `patient_intakes.status` → `triaged` or `cancelled`                                                    |
| Walk-in / referral / emergency arrival               | `patient_intakes(entry_type !=' booked_arrival')` + (if physical) `queue_entries.state='waiting'`                  | reception's incoming · nurse · doctor incoming-intake panels (emergencies rose-flagged + ordered first)                        | same — triage flip or cancel                                                                                        |
| Urgent-from-alert (no physical arrival yet)          | `appointments(priority='urgent', triggered_by_alert_id IS NOT NULL)`                                               | clinician's `/doctor/schedule` calendar with the rose ring                                                                     | patient arrives → standard check-in path                                                                            |
| Assignment (post-triage; or pre-clinic by in-charge) | `nursing_assignments(ends_at IS NULL)`                                                                             | nurse's `/nurse/patients` panel                                                                                                | `ends_at` set by in-charge, by encounter completion, OR auto-closed on `ha-complete-encounter` for the same patient |
| Active encounter                                     | `encounters.state='in_progress'`                                                                                   | doctor's `/doctor/patients` (active-encounter access basis)                                                                    | `ha-complete-encounter` sets `state='completed'` + `ended_at`                                                       |
| Visit ended                                          | `encounters.state='completed'` + `patient_intakes.status='completed'`                                              | patient's visit history at `/patient/appointments` Past + `/patient/care`                                                      | — (terminal)                                                                                                        |

**The nurse pre-clinic exception (§3 of kickoff) is honoured** by `listPresenceForRole('nurse', { mode: 'expected' })` — the same helper called with a different mode returns tomorrow's / today's not-yet-arrived bookings for the nurse's department. It's behind an explicit "Expected arrivals" view, NOT on the default active board.

## 4. The reception / records role — the big call

**Proposal: introduce a non-clinical cadre + role, NOT a new council.**

The doctor + nurse cadre catalogue is council-anchored because regulators (UMDPC, UNMC, AHPC, Pharmacy Board) genuinely gate clinical practice in Uganda. Reception/records is a hospital-employed administrative role with no national regulator. Introducing a fake "regulator" would muddy a clean clinical-safety design.

**Schema:**

```sql
ALTER TABLE public.cadres ADD COLUMN is_clinical boolean NOT NULL DEFAULT true;
-- Existing 19 cadres stay is_clinical = true (default). New rows are explicit.

INSERT INTO public.cadres (id, council_id, code, name, is_clinical, sort_order)
VALUES ('00000000-0000-0000-0000-000000000d14', NULL, 'RECEPTION',
        'Reception / Records Officer', false, 400);

INSERT INTO public.roles (id, cadre_id, specialty_id, code, name, department_family, sort_order)
VALUES ('00000000-0000-0000-0000-000000000e20',
        '00000000-0000-0000-0000-000000000d14', NULL,
        'RECEPTION_OFFICER', 'Reception / Records Officer',
        'HOSPITAL_OPERATIONS', 400);

-- Widen the user_roles CHECK.
ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_role_check;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('patient','clinician','nurse','pharmacist','lab_tech',
                  'hospital_admin','superadmin','reception'));
```

**Council nullability:** `cadres.council_id` is currently NOT NULL. The migration makes it nullable. Existing rows have a council; new non-clinical cadres do not. The clinical-signup form continues to require council selection because it gates on `is_clinical = true` cadres.

**Onboarding path:** `app/signup/reception/page.tsx` — accessible only via a hospital-admin-issued invite (mirrors the `hospital_staff_invitations` flow but with `invited_role_id` pointing at the RECEPTION_OFFICER role). The form captures: full name + email + phone + date of birth + national ID + employment letter upload + the hospital that invited them. **No licence number, no council registration, no clinician_profiles row.**

**Approval:** the hospital admin approves the affiliation (same surface as today's clinical approvals), grants the `reception` user_role. Suspendable / deactivatable through the same `staff_affiliations` lifecycle.

**Scope (RLS-enforced):**

- ✅ SELECT `patient_profiles` for `primary_facility_id = scope.hospitalId` — minimal columns only (patient_code, sex, dob, primary_facility_id).
- ✅ Audited PHI decrypt via `fetchReceptionPatientSummaryAudited` (new helper, mirrors the doctor/nurse pattern). The access-log surface text is `reception_*` so admin oversight can distinguish.
- ✅ INSERT `patient_intakes` via `ha-register-intake` (already allows any active affiliation).
- ✅ CALL `ha-check-in-patient`, `ha-mark-arrived`, `ha-record-walkin`, `ha-cancel-intake` (new + existing).
- 🚫 SELECT `clinical_observations`, `medication_administration_records`, `shift_handovers`, `encounters` (clinical content). Existing policies don't grant reception by name; we add an explicit deny is unnecessary because the existing `IN ('active','approved') AND staff_affiliations exists` policy doesn't gate by cadre — **but our reception-cadre user CAN still pass that policy.** This is the trap.
- **Therefore:** widen the existing SELECT policies on those three tables to require `staff_affiliations.cadre_id IN (clinical cadres)` — i.e. `EXISTS (SELECT 1 FROM staff_affiliations sa JOIN cadres c ON c.id = sa.cadre_id WHERE sa.user_id = auth.uid() AND sa.hospital_id = <table>.hospital_id AND sa.state IN ('active','approved') AND c.is_clinical = true)`. This closes the clinical-content access for reception without granting any new clinical role. **Critical: this is an additive policy widening, not a CHECK alter — no migration alters shipped behaviour for any existing user.**

**Sign-in routing:** add a new branch in `app/(auth)/sign-in/actions.ts` — reception cadre on active/approved affiliation → `/reception`.

## 5. Reception workspace — thin, focused

`/reception/*` mirrors the doctor + nurse shell pattern (sidebar from a small `RECEPTION_FEATURE_AREAS` registry; cadre indicator in top bar). Five surfaces:

1. **`/reception` (Overview)** — today's expected vs arrived counters; today's incoming intakes panel (reuses `IncomingIntakesPanel` already shipped); search box.
2. **`/reception/expected`** — today's confirmed appointments at this hospital with check-in buttons.
3. **`/reception/intake`** — reuses the existing `/hospital-admin/intake` form (the component is already self-contained); the URL changes, the auth-via-affiliation path already allows reception.
4. **`/reception/patients`** — search the Layer-1 directory (by patient_code; by name via audited decrypt on the detail panel).
5. **`/reception/today`** — checked-in / waiting today across all departments at this hospital (operational view; no clinical content).

No alerts panel, no MAR, no observations, no encounter detail — the boundary is the design.

## 6. Lifecycle write paths — closing the leaks

Without these, boards rot. All three are small Edge Functions following the existing pattern (Zod input, audit row, then mutate):

1. **`ha-complete-encounter`** — sets `encounters.state='completed'` + `ended_at=now()` + optional `completion_reason`. Cascades to `queue_entries` (set `state='done'`, `completed_at=now()`) for the patient's open queue row. Cascades to `patient_intakes` (set `status='completed'`, `encounter_id=encounters.id`) for any open intake for the same patient at this hospital today. **One write, three rows closed.** Audited with `complete_encounter`.

2. **`ha-cancel-intake`** — for the operator path (patient left without being seen; mis-registered; emergency stabilised + transferred out). Sets `patient_intakes.status='cancelled'` with a required ≥ 8-char reason. Audited with `cancel_intake`.

3. **`ha-check-in-patient`** — booked-arrival convenience: looks up the appointment, calls `ha-mark-arrived` (which already creates the queue row), AND inserts a `patient_intakes` row with `entry_type='booked_arrival'`, `appointment_id`, `status='awaiting_triage'`. **This is what reconciles the queue/intake disjointness** the recon flagged. Audited with `check_in_patient`.

**Auto-end semantics** (no cron required for MVP):

- `nursing_assignments` auto-end when `ha-complete-encounter` fires for the assigned patient (one DB sweep).
- Stale intakes (> 24h `awaiting_triage`) **are NOT auto-cancelled** — they're highlighted on the awaiting panels with a "lingering" badge so reception/in-charge notice. Auto-decay is a cron-job ticket post-triage.

## 7. Layer 1 — `/hospital-admin/patients` directory

Lists patients with `primary_facility_id = scope.hospitalId`. Columns: patient_code, sex, age (derived from DoB), date set primary (`patient_profiles.updated_at` is a weak proxy; flagged as a follow-up — adding a `primary_set_at` column is the proper fix, deferred). Search by `patient_code` (instant) and by name (opens a slow audited-decrypt search Edge Function, behind a "Search by name" button so the audit surface is intentional).

Opening a patient → audited decrypt → minimal demographic panel + links to: their booked appointments, their past visits, the intake button. No clinical content from this surface.

**Adds an Overview snippet:** "Patients known to us · N · X new this week" alongside the existing Staff + Scheduling tiles.

## 8. Admin Flow snippet — `FlowOverviewCard`

Follows the `StaffOverviewCard` / `SchedulingOverviewCard` convention exactly. Five stats:

| Stat                      | Source                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Expected today            | `appointments WHERE starts_at::date = today AND status IN ('confirmed','pending_approval','requested')`                     |
| Arrived today             | `appointments WHERE starts_at::date = today AND status='arrived'` + walk-in intakes today                                   |
| Awaiting triage           | `patient_intakes WHERE status='awaiting_triage'` (current count; no time floor — emergencies that linger should be visible) |
| Avg time-in-queue (today) | `queue_entries WHERE arrived_at::date = today AND called_at IS NOT NULL` → median minutes between arrived_at and called_at  |
| No-shows · last 7d        | already counted by SchedulingOverviewCard; reuse the same query                                                             |

## 9. Patient visit history — `/patient/appointments` Past + `/patient/care`

New `lib/patient/visit-history.ts` returns a unified `PatientVisit[]`:

- All `encounters WHERE patient_user_id = me AND state='completed'`.
- All `patient_intakes WHERE patient_user_id = me AND status='completed' AND encounter_id IS NULL` (intake that closed without ever becoming an encounter — left-without-being-seen, etc.).
- All `appointments WHERE patient_user_id = me AND status IN ('cancelled','declined','no_show','rescheduled')` (still appropriate for the "what happened" view).
- All `appointments WHERE patient_user_id = me AND status='completed' AND NOT EXISTS (SELECT 1 FROM encounters WHERE appointments.id = encounters.appointment_id)` (rare).

Sorted descending by completion timestamp. The Past section on `/patient/appointments` switches to this. `/patient/care` shows the same list filtered to the past 90 days + a "All visits →" link.

## 10. Engine status — reuse vs honest stub

| Engine                      | Status                                                                                                                                                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scheduling + queue + intake | **Reuse + add 3 Edge Functions** (complete-encounter, cancel-intake, check-in-patient).                                                                                                                                                                  |
| Doctor + nurse workspaces   | **Reuse** — incoming panels already shipped; presence model centralises in `lib/handling/presence.ts` for future surfaces; existing pages stay unchanged.                                                                                                |
| Monitoring / alerts         | **NOT built — stub honestly** (same as patient workspace, doctor workspace, nurse workspace before). Urgent-from-alert presence works because `appointments.priority='urgent'` already drives rendering; the alert _origin_ lands when the engine ships. |
| Care-team coordination      | **NOT built — stub honestly**. The `nursing_assignments` table is the closest available "team" signal today.                                                                                                                                             |
| Notifications dispatcher    | **NOT built**. Reception sees emergencies; SMS/push lands separately.                                                                                                                                                                                    |
| Triage logic                | **NOT built — out of scope.** This proposal's whole purpose is to deliver patients to `awaiting_triage` cleanly.                                                                                                                                         |

## 11. Out of scope (deferred — flagged at GATE F)

- Cron auto-decay for stale `awaiting_triage` intakes.
- `primary_set_at` column on `patient_profiles` (today: `updated_at` is the weak proxy).
- Cross-hospital "known to multiple hospitals" surface (today: one primary, single durable home).
- Care-team module (the `nursing_assignments` table is the only "team" signal we have).
- Patient-discoverable PHI access log (the audited reads exist; the patient-facing "who viewed me" surface lands with the consent centre).
- Bulk check-in / bulk assignment.
- Reception's own scheduling settings (they don't have a schedule).

## 12. Asks before I migrate

**Governance / clinical-safety:**

1. **§4 reception role** — introduce a non-clinical cadre + role + widen `user_roles` to include `'reception'` + make `cadres.council_id` nullable. The big call. OK?
2. **§4 reception scope** — patient_profiles minimal columns + audited PHI decrypt + INSERT `patient_intakes` + check-in actions; **no clinical content (observations / MAR / handovers / encounters)**. Confirm the line.
3. **§4 clinical-content RLS widening** — the existing SELECT policies on `clinical_observations`, `medication_administration_records`, `shift_handovers`, `encounters` widen to require `cadres.is_clinical = true`. **Additive** (doesn't alter behaviour for any existing user; just stops reception from inheriting access). OK?

**Schema:** 4. **Migration 0033** — `is_clinical` boolean on `cadres`; `council_id` nullable; `RECEPTION` cadre + `RECEPTION_OFFICER` role seeded; `user_roles` CHECK widened; `patient_intakes.encounter_id` + `status='completed'`; `encounters.completion_reason`; new Overview-snippet RLS policy on `patient_profiles`. OK? 5. **Three new Edge Functions** — `ha-complete-encounter` (cascades to queue + intake), `ha-cancel-intake`, `ha-check-in-patient`. OK?

**Surfaces:** 6. **`/reception/*` thin workspace** (5 surfaces) — sibling to `/doctor` and `/nurse`. Sign-in routing branches for reception cadre. OK? 7. **`/hospital-admin/patients`** + **`FlowOverviewCard`** snippet on the Overview. OK? 8. **`lib/handling/presence.ts`** — typed helpers, no new table. The four existing tables ARE the presence model. OK? 9. **`lib/patient/visit-history.ts`** + rewire `/patient/appointments` Past + fill `/patient/care`. OK?

**Scope:** 10. **§11 out-of-scope list** — anything to pull back in?

Once signed off: migration 0033 + the three Edge Functions + the reception workspace + `/hospital-admin/patients` + presence helper + visit-history + FlowOverviewCard in one PR. Estimated diff is ~3000 LOC.
