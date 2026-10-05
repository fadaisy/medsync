# PROMPT — Closing the encounter: outpatient management, admission with a bed, and the patient's copy

**For:** Claude Code, working in `justfadhul/medsync`. Branch off `main` (at or after `8e45d34`); use a new branch named `feat/encounter-closure`.
**Owner and CSO:** Usama Fadhul.
**Read first:** `AGENTS.md`, then `docs/CLAUDE-HANDOFF.md`. This Next.js has breaking changes: read the relevant guide in `node_modules/next/dist/docs/` before writing code. `DESIGN-medsync.md` wins every visual disagreement.

Work in phases. **Every phase ends with STOP:** report what you did, what you found, the commands you ran and their results, then wait. If the owner says "go through all gates", run every phase in one go and stop only for signatures and decisions. Do not commit to `main`, do not push to `main`, do not deploy, and do not run `npm run db:migrate`. Migrations marked GATED are written and reviewed only; the owner applies them. The next migration number is **0091** (check `supabase/migrations/` and open PRs first: 0086 is on PR #188). The next ADR is **0197**.

---

## 0. What we are building, in one paragraph

Today a doctor can plan a disposition in step 10 (Admit to a ward, Observe in EU, Refer, Discharge), but nothing carries it through. "Complete visit" asks for the disposition again in a different vocabulary, admission creates no record, a doctor cannot see or take a bed, a follow-up is a date in a JSON field, and the patient sees nothing. This build closes the loop:

1. **One close, prefilled from the Plan.** The Plan's decision becomes the encounter's disposition. The close dialog asks only what the Plan did not.
2. **Going home (outpatient management).** Take-home medicines, a follow-up booked into a real slot, come-back advice, and the existing printouts.
3. **Admission.** An `admissions` record. The doctor sees each ward's beds from the ward builder and allocates one. The bed is held as **Arriving**, and the ward nurse confirms **Arrived**, which opens the inpatient encounter. With no free bed, the patient is admitted anyway and waits on the ward's **Waiting for a bed** list.
4. **The patient's copy.** On close the doctor sees a plain-language, patient-facing preview of the visit (diagnoses, medicines, tests, follow-up, admission ward and bed) with restricted items already removed. They **share** it or **hold** it with a reason. Shared summaries appear on `/patient/care`.

## 1. Decisions the owner has already made (do not re-open)

| #   | Decision                                                                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Allocate, ward confirms.** The doctor's pick holds the bed immediately (state **Arriving**; nobody else can take it). The ward nurse taps **Arrived** when the patient is in the bed, and only then is it Occupied.                                                                                          |
| D2  | **No bed does not block admission.** The admission goes ahead to the ward and the patient appears on that ward's **Waiting for a bed** list with a reason (no free bed / extra bed / floor / other). The gap is recorded as data, as resus records its level-of-care mismatch (ADR 0108).                      |
| D3  | **Doctor reviews, then shares.** Nothing reaches the patient automatically. The close dialog shows the patient-facing preview. **Share with patient** publishes it, and **Hold** needs a reason. A held summary can be shared later from the closed encounter.                                                 |
| D4  | **Scope stops at arrival on the ward.** Admission decision → bed → arrival → inpatient encounter opened. Ward rounds, transfers between wards, and discharge from the ward (discharge summary, bed release to Cleaning, take-home medicines from the ward) are a follow-up prompt. Leave clean seams for them. |

## 2. Safety rules that override everything below

1. **No fabricated data.** No demo patients, beds, slots or wording in production. Fixtures live under `tests/` and the `/styleguide` fixture routes only.
2. **Decision support, never autonomous.** MedSync never chooses a ward, a bed, a follow-up interval or a diagnosis. It shows what is free and what the Plan said; the clinician decides.
3. **A restricted fact never reaches the patient.** Every patient-facing payload passes through `toPatientFacing` (`lib/emr/chart.ts`), or an extension of it that is property-tested the same way. The doctor can remove further items in the preview; they can never add a restricted one back.
4. **Patient-facing wording is CSO-signed or the clinician's own.** Come-back advice, lay diagnosis names and section headings shown to patients are drafts until the CSO signs them. Until then the patient copy shows the clinical term and the clinician's own typed words, never draft template text. Label every draft in the code and in the STOP report.
5. **A deceased patient never gets a patient summary.** Closing as died offers no share. Next-of-kin communication is out of scope.
6. **Notifications carry no clinical content.** Any SMS or push says only that a visit summary is ready; the content is behind sign-in.
7. **Clinical records are append-only and audited.** Admissions, allocations, arrivals and shared summaries are never edited in place: they end, are superseded, or are corrected by a new row. Every write records who and when, and goes through an Edge Function (RLS-first; no client writes).
8. **Colour never carries state alone.** Every bed state has its word. Red is for genuine emergencies only. No left-edge accent bars; headings are weight 500. Motion follows `DESIGN-medsync.md` only.
9. **Pop-ups are centred landscape dialogs** (`EditorDialog`, ADR 0161). The close dialog and the bed picker are centred, never side sheets.

## 3. Where things are today (verify in Phase 0)

| Area         | Where                                                                                                                                                                                                                                                                                             | What matters                                                                                                                                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Encounter    | `db/schema/scheduling.ts` (`encounters`, ~376–472)                                                                                                                                                                                                                                                | `state`, `disposition` (+ `encounters_disposition_check`), `disposition_detail` jsonb, `follow_up` jsonb, `closure_kind`, `encounter_type` already includes `inpatient` (never written today).                                                                         |
| Completion   | `supabase/functions/ha-complete-encounter/index.ts`; `lib/emr/actions/encounter.ts` (`completeEncounter`, `closeEncounterAdministratively`); `lib/emr/write/encounter.ts` (`planCompletion`); `lib/emr/encounter.ts` (`DISPOSITION_CODES`, `storedDisposition`, `FollowUp`, `completionWarnings`) | One completion path (ADR 0139). The cascade completes the open intake and **ends every open nursing assignment for the patient**.                                                                                                                                      |
| Close UI     | `components/emr/desk/complete.tsx` (`CompleteVisitView`), `desk-client.tsx` (~1300–1343, in `EmrDialog`), `components/emr/desk/flows.ts` (`completeFlow`, `closeFlow`), `components/clerking/clerking-desk.tsx` `SignBar`                                                                         | **It does not prefill from the Plan and never sends `disposition_detail`**, so the referral print (`components/emr/print-views.tsx` ~100) reads empty reason, urgency and transport.                                                                                   |
| Plan         | `lib/clerking/plan/draft.ts` (`PlanSchema`, `DISPOSITIONS = admit                                                                                                                                                                                                                                 | observe_eu                                                                                                                                                                                                                                                             | refer | discharge`, `ward`is a free-text name,`followUp{when, where, comeBackAdvice}`), `lib/clerking/plan/compose.ts` (`FOLLOW_UP_WHEN`), `lib/clerking/plan/checklist.ts`, `components/clerking/plan/plan-step.tsx`, `lib/emr/read/plan.ts` (`PlanPayload.wards`: names only) | The Plan's disposition never reaches `encounters.disposition`. |
| Steps        | `lib/clerking/status.ts` `SECTIONS` (01–10; 10 Plan is last)                                                                                                                                                                                                                                      | No close step; closing is the SignBar's "Complete visit".                                                                                                                                                                                                              |
| Beds         | `db/schema/ward-builder.ts` (`bed_assignments`, `bed_state_events`), `db/schema/services-hub.ts` (`hospital_beds`), `db/schema/hospital-wards.ts`; migration `0090_ward_builder.sql` (`bed_assignments_guard`, one open row per bed and per patient)                                              | No `admission_id`, no arrival column.                                                                                                                                                                                                                                  |
| Bed writes   | `supabase/functions/ha-services-hub/ops-wards.ts` (`assign_bed`, `release_bed`, `set_bed_state`, `assertWardWorker`)                                                                                                                                                                              | **Doctors may not act** (ADR 0194 §3). `assign_bed` needs an open intake with `receiving_ward_id` = the bed's ward. Completion closes that intake, so admitting today removes the patient from the board's candidates. Nothing sets `receiving_ward_id` from a screen. |
| Board        | `lib/wards/board.ts` (`loadBedBoard`, `candidates`), `lib/wards/use-board-live.ts` (`ward-beds:<hospital>`), `app/nurse/beds/`, `app/hospital-admin/departments/wards/[wardId]/board/`, `supabase/functions/_shared/ward-layout.ts` (`BED_STATES`)                                                | Patient names are shown only to the hospital admin and that ward's staff.                                                                                                                                                                                              |
| Booking      | `supabase/functions/ha-book-on-behalf` (any active staff; always writes `origin: "reception"`), `APPOINTMENT_ORIGINS` includes `clinician`, appointment reasons include `follow_up` and `post_discharge`                                                                                          | Nothing books from an encounter.                                                                                                                                                                                                                                       |
| Co-sign      | `clinical_cosign_requests.action_kind` includes `admit_patient` and `discharge_patient`; policies seeded in 0030 (interns and clinical officers need a co-sign)                                                                                                                                   | **No writer creates these requests.**                                                                                                                                                                                                                                  |
| Patient side | `app/patient/care/page.tsx` (an empty page listing "A summary after each visit", "Prescriptions and lab results" as coming); `app/patient/track/medications` + `lib/patient/self-tracking.ts`; `app/patient/appointments`; `lib/patient/scope.ts`; ADRs 0026, 0028 (access basis), 0100           | No clinical record reaches a patient today.                                                                                                                                                                                                                            |
| Flags        | `lib/emr/feature.ts` (`EMR_V1`, `CLERKING_V2`, `CLERKING_PLAN_V2`), `lib/wards/feature.ts` (`WARD_BUILDER`)                                                                                                                                                                                       | Per-hospital: `1` or a comma-separated list of hospital ids.                                                                                                                                                                                                           |

---

## Phase 0 — Discovery (no product changes)

1. Read every file in §3 and confirm or correct the table. Note anything that moved.
2. Trace the whole close today, end to end: SignBar → `completeFlow` → server action → `ha-complete-encounter` → the cascade (encounter, `encounter_events`, queue, intake, nursing assignments, appointment, `sa_audit_log`) → the boards ADR 0101 updates. List each write.
3. Confirm how the Plan's prescriptions are stored (0088 columns; `start`, `kind`) and which OPD columns from 0074 already describe a take-home supply (duration, quantity, instructions). Do not plan a column that already exists.
4. Confirm how `toPatientFacing` decides `restricted` (diagnoses, problems, prescriptions, orders) and where its property test lives. Confirm how PHI is stored at rest for anything patient-facing (the `*_ciphertext` pattern and `MEDSYNC_PHI_KEY`).
5. Confirm the patient access basis (ADR 0028): who may read a patient's records (the patient, household proxies?), and how `/patient/*` loads data under RLS.
6. Find any existing notification channel to patients (`docs/ops-channels.md`, SMS, push, in-app). Say what exists; do not build a new channel in this prompt.
7. Check whether `mobile/` renders patient screens. If it does, list the parity work; it is a follow-up unless it is a thin read.
8. Check how the Doctor Workspace and reception boards label a completed encounter, so **Admitted · Ward X** can show there.

**STOP.** Report: the corrected map; the full close cascade; the list of new tables, columns and Edge Function ops you expect (not written); the risks, including the nursing-assignment cascade and the intake/candidate conflict.

## Phase 1 — Decisions (ADRs only)

Write the ADRs, numbered from 0197, and mirror them in `CHANGELOG.md`. Each is **Proposed** until the owner accepts it.

1. **One close, prefilled from the Plan.** Supersedes the double entry in ADR 0139 for flag-on hospitals:
   - Map the Plan to the completion codes: `discharge → home`, `admit → admitted` (with the ward id), `refer → referred_out` (with destination, reason, urgency and transport into `disposition_detail`, which also fixes the empty referral print). **`observe_eu` is not a closure**: the encounter stays open and the close button says why.
   - The dialog may change the Plan's choice, but a change is recorded as an edit (the Plan said X, closed as Y) and the note shows it.
   - The Plan's ward becomes a ward **id**, not a free-text name.
2. **Admission record.** A new `admissions` table: one open admission per patient, from a source encounter to a ward, with a status that grows over time. Proposed statuses for this build: `awaiting_bed`, `bed_allocated`, `arrived`, `cancelled`. The follow-up prompt adds `discharged`, `transferred` and `died`, so name the column for that.
3. **Doctors allocate; the ward confirms.** Supersedes ADR 0194 §1 and §3 in part:
   - A new derived bed state, **Arriving**: an open assignment with no `arrived_at`. It ranks above Free, Cleaning and Reserved, and counts as unavailable.
   - Who may **allocate**: the source encounter's clinician, with an active clinical affiliation at the hospital, only for the patient they are admitting. They may not release, mark cleaning, reserve, or touch other patients.
   - Ward staff (ADR 0194's list) may also allocate from the waiting list, confirm **Arrived**, and cancel an allocation with a reason (patient went elsewhere, died before arrival, left, other). Cancelling returns the admission to `awaiting_bed`, or ends it.
   - **Nothing auto-releases** a held bed (as ADR 0139: nothing auto-closes). A bed held as Arriving longer than a threshold goes to the ward's _Needs attention_. The threshold is a proposed value for the owner.
4. **Admission is atomic.** Creating the admission, allocating the bed (or joining the waiting list) and completing the source encounter as `admitted` happen in **one** transaction: a `security definer` SQL function callable only by `service_role` (the `ward_layout_publish` pattern), called from the Edge Function. Two doctors racing for one bed: the second gets "That bed was just taken" and a fresh board; nothing half-written.
5. **The close cascade, for admission.**
   - The source intake still completes and the EU or OPD queue row is done (ADR 0101 boards show **Admitted · Ward X**).
   - Bed candidates come from `admissions` (`awaiting_bed` for that ward), not from intakes. Write `receiving_ward_id` too, for compatibility.
   - Decide, with evidence from Phase 0, whether the cascade should still end every open nursing assignment for the patient, or only those of the source encounter's unit.
6. **Arrival opens the inpatient encounter.** On **Arrived**, open an `encounters` row with `encounter_type: 'inpatient'`, linked to the admission, owned by the admitting team. State how it links to a visit, given `visit_id` → `patient_intakes`.
7. **Co-sign for admit and discharge.** Use the existing `admit_patient` / `discharge_patient` policies:
   - When the closer's cadre needs a co-sign, the close goes ahead and a `clinical_cosign_requests` row is raised, a warning and not a block, like ADR 0139's warnings.
   - The patient summary can still be shared before the co-sign, unless the owner says otherwise.
   - Mark this proposal clearly; it is the owner's call.
8. **Follow-up is a booking.** The close dialog books a real slot through `ha-book-on-behalf` with `origin: 'clinician'` and reason `follow_up`:
   - with the same clinician or clinic by default, any clinician of the department as the alternative;
   - when no schedule or slot exists, it falls back to the review date and says so;
   - the booking appears in `/patient/appointments` like any other.
9. **The patient's copy.**
   - A new `patient_visit_summaries` table: an immutable, versioned snapshot composed at share time by one pure function from the record, after `toPatientFacing` and the doctor's removals.
   - It records `shared_by`, `shared_at`, the items removed (by id, not content), and any hold reason. A correction is a new version that supersedes, and the patient sees "Updated".
   - The same composer feeds the patient printout, so the paper and the app never differ.
   - Store it the way Phase 0 found PHI is stored.
10. **Take-home medicines reach the tracker by consent.** On a shared summary, the patient may tap **Add to my medicines**, which creates self-tracking rows prefilled from the prescription and linked by `prescription_id`. Nothing is added without the patient's tap. The tracker never shows a dose the prescription did not state.

**STOP.** The owner reviews the ADRs.

## Phase 2 — Data (GATED migrations written, not applied)

Each migration has the GATED header, RLS enabled, audit triggers mirroring 0039/0074/0090, and Drizzle intent in `db/schema/*`. No client writes.

1. `admissions`:
   - `id`, `hospital_id`, `patient_user_id`, `source_encounter_id`, `inpatient_encounter_id` (null until arrival), `ward_id`, `decided_by`, `decided_at`, `leading_condition_id` (from 09 Impression), `status`, `bed_wait_reason` (code + optional encrypted note), `cancelled_at/by/reason`, `arrived_at/by`;
   - a partial unique index for one open admission per patient;
   - a guard trigger: rows only move forward and are never deleted.
2. `bed_assignments` gains `admission_id`, `arrived_at` and `arrived_by`. Extend `bed_assignments_guard` so `arrived_at` is set once, and extend the derived states and `BED_STATES` with `arriving`.
3. The SQL function for the atomic admission (Phase 1 §4), plus the arrival function (sets `arrived_at`, moves the admission to `arrived`, opens the inpatient encounter) and the cancel function. All are `service_role` only.
4. `patient_visit_summaries`, as Phase 1 §9. RLS: the patient (and any proxy the access basis allows) reads only rows with `shared_at` set and not superseded. Staff read per the existing clinical-staff rule.
5. Extend `sa_audit_log`'s action check with: `admit_patient`, `allocate_bed`, `confirm_arrival`, `cancel_allocation`, `share_visit_summary`, `hold_visit_summary`.
6. Any prescription columns for a take-home supply that Phase 0 found missing, and nothing more.

Edge Functions:

- **`ha-complete-encounter`** gains the admission branch (calling the SQL function) and the referral detail. A caller sending none of the new fields keeps the old behaviour exactly.
- **`ha-services-hub` ops-wards** gains `confirm_arrival`, `cancel_allocation` and the waiting-list allocate. `assertWardWorker` is unchanged for every existing op.
- A patient-summary op (new function or an existing one; say which and why) for share, hold and supersede.

**STOP.** Report the migrations (not applied), the functions, and the apply order.

## Phase 3 — The close dialog and going home

Replace `CompleteVisitView`'s sheet with a centred `EditorDialog` (`wide`), behind a new per-hospital flag **`ENCOUNTER_CLOSE_V2`**. With the flag off, nothing changes.

1. **Header:** "Close visit", the patient's two identifiers, and the Plan's decision as a line: "Plan: Admit · Medical ward" (or "No plan yet: choose below").
2. **Outcome chips**, prefilled from the Plan: Home · Admit · Refer · Died · Left before completion · Left against advice. **Observe in EU** shows a note that the visit stays open, with a link back to the Plan. Changing the Plan's choice shows "Plan said X" struck through.
3. **Home: outpatient management**
   - **Medicines to take home:** each active prescription from this visit with Continue at home / Stop now. New take-home items open the existing prescribing dialog (ADR 0186) with the take-home fields. Each line reads as the patient will see it. Pharmacy stays `not_linked` (ADR 0190).
   - **Follow-up:** the Plan's interval (1 w / 2 w / 4 w / 3 m / none / as needed) → the next free slots with this clinician or clinic, as tappable times. Pick one to book. With no schedule: "No clinic schedule found: a review date will be recorded instead", then the date. Booked, it reads "Booked: Tue 14 Oct, 09:20, Dr X, Medical OPD".
   - **Come back if:** the clinician's own words, plus CSO-signed advice sets once signed (none ship signed; say so).
   - **Prints:** the existing visit summary, referral, lab request and specimen label, plus the patient copy (Phase 5).
4. **Refer:** destination, reason, urgency and transport, written into `disposition_detail` (fixes the referral print).
5. **Died:** the existing path (`deceased`; ADR 0115). No patient copy. The cause-of-death record is still not built (ADR 0139); say so in the dialog.
6. **Warnings** (unsigned notes, no diagnosis, orders not collected) stay as warnings.
7. **Co-sign line** when the cadre needs one: "A senior co-sign will be requested."
8. **Footer:** the reason the button is disabled, in words; Cancel; **Close visit**. Then the patient-copy step (Phase 5) in the same dialog.

Also update the Plan: the ward picker becomes ward ids, with each ward's free / arriving / occupied counts from the board engine, shown as words. With `WARD_BUILDER` off for the hospital, it shows ward names only and no counts.

**STOP.** Screenshots at 1440 and a narrow width for Home (with a booked slot and with no schedule), Refer and Died. Run typecheck, lint and test.

## Phase 4 — Admission and the bed

**Doctor side (the close dialog, Admit):**

1. The ward, prefilled from the Plan, is changeable to any active ward of the hospital that admits.
2. **The bed picker:**
   - A read-only rendering of that ward's floor from the ward builder (reuse the board's components and `loadBedBoard`).
   - Every bed carries its state word and tint (Free, Arriving, Occupied, Cleaning, Reserved, Out) and its type and services.
   - Free beds are selectable, and the rest are not, with the reason on focus.
   - **Doctors never see other patients' names**, only states.
   - A list view of the free beds sits beside the floor for keyboard and screen-reader use.
   - Live through `ward-beds:<hospital>`; a bed taken while open greys out with "Taken just now".
3. **No free bed (or the doctor chooses not to pick one):** "Admit and wait for a bed", with a reason chip (No free bed / Extra bed / Floor / Other: type). The reason wording is a draft for the CSO.
4. **Confirm:** the summary line "Admit to Medical ward · Bed 12 (arriving)" or "Admit to Medical ward · waiting for a bed (no free bed)". **Admit and close visit** runs the atomic function.

**Ward side (`app/nurse/beds/` and the hospital-admin board):** 5. The **Arriving** state on the board, with the patient's name and MRN for ward staff, the admitting clinician, the time held, and **Arrived** / **Cancel with reason**. Arrived opens the inpatient encounter. 6. **Waiting for a bed:** a list of `awaiting_bed` admissions for the ward, oldest first, with wait time and reason. Ward staff can allocate a bed from it, which makes the bed Arriving. The board's old intake-driven candidates come from this list now. 7. **Needs attention:** beds held as Arriving beyond the proposed threshold.

**Elsewhere:** the Doctor Workspace, reception and the hospital-admin boards show **Admitted · Ward X (Bed 12 / waiting)** for the closed visit.

**STOP.** Screenshots: the bed picker with mixed states; waiting-for-bed admission; the ward board with an Arriving bed and the waiting list; after Arrived. Run the tests.

## Phase 5 — The patient's copy

Behind a second per-hospital flag, **`PATIENT_VISIT_SUMMARY`**, because releasing records to patients is its own risk.

1. **Composer** (`lib/patient/visit-summary.ts`, pure, unit-tested). From the closed encounter, after `toPatientFacing`, it builds:
   - the visit: date, hospital, clinician name and cadre, and outcome in plain words (Went home / Admitted to {ward}, bed {n} or "waiting for a bed" / Referred to {place});
   - **what we found:** the confirmed and leading diagnoses, clinical term plus the CSO-signed lay name where one exists. Differentials are never shown;
   - **medicines:** take-home items exactly as prescribed (name, how much, how often, how long, how to take), and medicines stopped;
   - **tests:** ordered tests by name with "results will be shared after your clinician reviews them" (results are a later prompt);
   - **next:** the booked follow-up or review date, and the come-back advice;
   - for an admission: the ward and the bed once allocated, and "your care team on the ward will update you".
2. **The preview step in the close dialog:**
   - the patient copy, rendered exactly as the patient will see it;
   - each item has a remove toggle (removing records the item id);
   - restricted items are absent, with a count line ("2 items are restricted and never shown to patients");
   - **Share with patient** or **Hold**, with a reason chip: Tell in person first / Waiting for a result / Patient asked not to / Other: type. The reason wording is a draft;
   - a held summary shows **Share now** on the closed encounter later.
3. **`/patient/care`:**
   - "Your visits", newest first; each opens the summary;
   - **Add to my medicines** on take-home items (Phase 1 §10);
   - the booked follow-up links to `/patient/appointments`;
   - remove "A summary after each visit" and "Prescriptions…" from the coming-next list once shipped, and keep the page honest when there is nothing yet.
4. **Notify** only through a channel Phase 0 found: "Your visit summary from {hospital} is ready". No clinical content.
5. **Never** for a deceased patient, an administrative closure, or an encounter entered in error.

**STOP.** Screenshots of the preview (with a removed item and a restricted count), the patient's visit list and a summary, at phone width and at 1440. Run the tests.

## Phase 6 — Tests

Vitest at least for:

- the Plan → completion mapping, including `observe_eu` refusing to close and an edited outcome being recorded;
- the referral detail reaching `disposition_detail` and the print;
- the derived bed state with Arriving, and its rank;
- allocation rights: the admitting clinician only for their patient, ward staff, and refused for others; a doctor cannot release or set state;
- the atomic admission: race on one bed, waiting-list path, rollback when any part fails;
- arrival opening one inpatient encounter, never two;
- cancel with reason returning to the waiting list;
- the candidate list coming from admissions;
- co-sign requests raised by cadre;
- follow-up slot search, booking with `origin: 'clinician'`, and the no-schedule fallback;
- the patient composer: a property test that no restricted item and no removed item ever appears; no differentials; deceased and administrative closures produce nothing;
- supersede versions;
- RLS for `admissions` and `patient_visit_summaries` in `tests/rls/` (a patient sees only their own shared, current summaries; another patient sees nothing; staff per the rule).

**STOP.**

## Phase 7 — Ship check

Run `npm run typecheck && npm run lint && npm run test`, then `rm -rf .next && NODE_OPTIONS=--max-old-space-size=6144 npm run build`. Check `/styleguide` if tokens changed (the Arriving state). Do a keyboard-only pass of the close dialog and the bed picker: focus trap, Escape closes, every chip and bed reachable and announced with its state.

Update `docs/CLAUDE-HANDOFF.md` (the new rows, migrations and flags) and write `docs/emr/closure/STOP-REPORTS.md`.

**STOP.** Report the results, then list for the owner:

- the migrations in apply order;
- the Edge Functions to deploy;
- the flags (`ENCOUNTER_CLOSE_V2`, `PATIENT_VISIT_SUMMARY`) and their prerequisites (`CLERKING_PLAN_V2` for the prefill, `WARD_BUILDER` for beds);
- everything awaiting signature.

---

## Appendix A — Drafts that need the CSO's signature before patients see them

- Come-back advice sets, if any are proposed.
- Lay diagnosis names.
- The patient copy's section headings and outcome sentences.
- The hold reasons, bed-wait reasons and allocation-cancel reasons.
- The Arriving hold threshold for _Needs attention_.
- The co-sign behaviour (proceed and request, not block).

## Appendix B — Out of scope (seams only)

- Ward rounds and the inpatient note.
- Transfers between wards.
- Discharge from the ward: the discharge summary note type, bed release to Cleaning, `discharge_patient` co-sign use, and the patient copy for an inpatient stay.
- Lab results to patients.
- The cause-of-death record and MPDSR.
- Pharmacy stock.
- Mobile parity (unless Phase 0 shows it is a thin read).
- Notifications beyond an existing channel.
