# Closing the encounter: STOP reports

Branch `feat/encounter-closure`, off `main` at `8e45d34`, in the worktree `~/Desktop/medsync-closure`. The owner said
"go through all gates", so each phase is recorded here and the build runs on, stopping only for signatures and
decisions. Prompt: `docs/emr/closure/PROMPT-ENCOUNTER-CLOSURE.md`. Owner decisions D1–D4 are in the prompt's §1.

## STOP 0: Discovery

### The map (§3), confirmed

Every row of the prompt's §3 table holds on `8e45d34`. Corrections and additions:

| Area          | Finding                                                                                                                                                                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Close UI      | `CompleteVisitView` already sits in `EmrDialog` (the centred `EditorDialog`, ADR 0161), not a sheet. It is opened by `SignBar`'s "Complete visit" through `desk-client.tsx`'s `sheet === "complete"`. The client holds the clerking note's content, so `content.plan` (the Plan draft) is in reach of the dialog without a new read. |
| EMR writes    | EMR writes are **not** Edge Functions. `withPatientWrite` opens a service-role transaction with the audit identity set and the access rule checked inside it (ADR 0131). Only the lifecycle (`ha-start-encounter`, `ha-complete-encounter`) and the ward ops (`ha-services-hub`) are Edge Functions.                                 |
| Board         | `loadBedBoard` derives state in its own `stateOf`, beside the pure `bedState()` in `_shared/ward-layout.ts`. Both need the new state. `PlanView` paints a state from `STATE_PAINT` and `BedBoard`'s `StateWord` from `SWATCH`.                                                                                                       |
| Prescriptions | Already carry `frequency`, `duration`, `quantity`, `instructions_ciphertext` and `sensitivity` (0074). **No take-home column is needed.** Stopping one is `state` → `completed` plus `stopMedicationStatement` (a free-text reason code).                                                                                            |
| Booking       | `ha-book-on-behalf` lets any active staff book; it hard-codes `origin: "reception"`. The slot engine is `fetchLines` (`lib/scheduling/booking-options.ts`), shared by the patient and the desk; its window starts at the `now` it is given.                                                                                          |
| Co-sign       | 0030 seeds `admit_patient` per hospital: interns and clinical officers `cosign_required`, medical officers and above `allowed`. The insert pattern is the prescription one (`lib/emr/write/prescriptions.ts`, PHI-free `action_payload`).                                                                                            |
| Patient       | Patient pages read with `db` filtered by `requirePatientScope().userId`; the tracker writes `self_medications` through the patient's RLS client. `/patient/care` is an honest empty page.                                                                                                                                            |
| Restricted    | The rule is `sensitivity === "restricted"` (conditions, prescriptions, orders); `toPatientFacing` and the print views' `printable()` both apply it.                                                                                                                                                                                  |
| Notifications | `notification_dispatches` (push and SMS, consent-gated) exists, but its kinds and related kinds are CHECK-constrained and its copy is booking-shaped. A new kind touches the migration, the Deno builder, two composers and the strings.                                                                                             |
| Mobile        | `mobile/` has no patient visit screens; parity is a follow-up.                                                                                                                                                                                                                                                                       |
| Flags         | Per-hospital env flags, `1` or a list of ids, read in `lib/*/feature.ts`.                                                                                                                                                                                                                                                            |
| Next numbers  | Migration **0091**; ADR **0197**.                                                                                                                                                                                                                                                                                                    |

### The close today, end to end

`SignBar` "Complete visit" → `CompleteVisitView` (disposition chip, follow-up) → `completeFlow` → `completeEncounter` (server action) → `planCompletion` in `withPatientWrite` (cadre, transition rules, three warnings) → `callEdge("ha-complete-encounter")`, which writes:

1. `sa_audit_log` `complete_encounter` (before anything else; a failure stops the close);
2. `encounters` → `completed`, `ended_at`, `completed_by`, `closure_kind`, `disposition`, `disposition_detail`, `follow_up` (guarded on state, so a double submit is a no-op);
3. `encounter_events` `disposition`;
4. `queue_entries` → `done` (this encounter's row and the patient's waiting row in the department today);
5. `patient_intakes` → `completed` (this visit's open intake);
6. `nursing_assignments.ends_at` for **every** open assignment of the patient at the hospital;
7. `appointments` → `completed` for the linked appointment.

Steps 3–7 are non-fatal and not in one transaction with step 2. One write updates the five boards of ADR 0101.

### Expected new objects (written in Phase 2)

- Tables: `admissions`; `patient_visit_summaries`.
- Columns: `bed_assignments.admission_id`, `arrived_at`, `arrived_by`; `self_medications.source_prescription_id`.
- SQL functions (service role only): `admit_from_encounter`, `allocate_admission_bed`, `confirm_bed_arrival`, `cancel_bed_allocation`.
- Edge Function changes: `ha-complete-encounter` (the admission branch, the booked follow-up, the referral detail), `ha-services-hub` ops-wards (`allocate_admission_bed`, `confirm_arrival`, `cancel_allocation`), `ha-book-on-behalf` (`origin: "clinician"`).
- Audit verbs: `admit_patient`, `allocate_bed`, `confirm_arrival`, `cancel_allocation`.

### Risks

1. **The nursing-assignment cascade.** A patient admitted with no free bed stays in EU. Ending every nursing assignment at close would take them off the EU nurse's list while they still lie there. Decided in ADR 0200: for an admission, assignments on other wards end on **arrival**.
2. **The intake/candidate conflict.** The board offers patients from open intakes; the close completes the intake. Decided in ADR 0200: the board offers admissions.
3. **Long inpatient encounters look idle.** The Workspace flags an open encounter idle after 24 h. An inpatient stay is days. Decided in ADR 0200: inpatient encounters are not idle-flagged.
4. **Two writes that must not half-happen** (the admission and the bed, the bed and the close). Decided in ADR 0200: one SQL function.
5. **Patient-facing words.** No CSO-signed lay names or advice exist, so the patient copy carries clinical terms and the clinician's own words only (rule 4).

## STOP 1: Decisions

ADRs 0197–0203 written as **Proposed** and mirrored in `CHANGELOG.md`:

| ADR  | Decision                                                                                                                                                                                                   | Supersedes                                                |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 0197 | One close, prefilled from the Plan; `observe_eu` keeps the visit open; changes recorded as `plan_said`; referral detail written; ward by id                                                                | ADR 0139's second entry of the disposition (flag-on only) |
| 0198 | `admissions`: one open per patient; four statuses for this build; the wait reason as data                                                                                                                  | —                                                         |
| 0199 | Arriving (a sixth state); the doctor allocates only inside the admission; ward staff confirm or cancel; held > 4 h → Needs attention (proposed value)                                                      | ADR 0194 §1, §3 in part                                   |
| 0200 | One SQL function for admission + bed + close; nursing assignments end on arrival; candidates from admissions; arrival opens the inpatient encounter (no `visit_id`); inpatient encounters not idle-flagged | extends ADR 0139 §2                                       |
| 0201 | Admission co-sign: proceed and request; no policy row = request                                                                                                                                            | — (**owner's call**)                                      |
| 0202 | Follow-up books a real slot (`origin: 'clinician'`); `follow_up.kind = 'booked'`; no schedule → review date                                                                                                | —                                                         |
| 0203 | The patient's summary: one composer, restricted dropped first, share or hold, versioned, tracker by tap; no notification yet                                                                               | —                                                         |

Two departures from the prompt, both deliberate:

- **Share and hold are written in the clinician's transaction** (`withPatientWrite`), not an Edge Function: that is
  how every EMR write is made (ADR 0131), with the access rule checked in the same transaction and row audit.
  So no `share_visit_summary` / `hold_visit_summary` audit verbs either; the row audit covers them.
- **`discharge_patient` is not raised for going home** from a visit: it belongs to discharge from the ward (D4).

## STOP 2: Data (GATED migration written, not applied)

**Migration `0091_encounter_closure.sql` (GATED, for the owner):** `admissions` (guarded moves, one open per
patient, one per source visit), `bed_assignments.admission_id / arrived_at / arrived_by` (the guard lets an
arrival be stamped once; old rows have no admission and stay Occupied, so no backfill), four functions on the
service role only (`admit_from_encounter`, `allocate_admission_bed`, `confirm_bed_arrival`,
`release_admission_bed`, plus the shared `admission_free_bed` check), `patient_visit_summaries` (append-only,
supersede once, the patient reads their own current shared row), `self_medications.source_prescription_id` (once
per prescription), the live topic on admissions and arrivals, and the four audit verbs. Drizzle intent:
`db/schema/admissions.ts`, `ward-builder.ts`, `patient-self-tracking.ts`.

**Edge Functions:**

- `ha-complete-encounter`: `admission` (ward, bed or wait reason) → `admit_from_encounter`, then the cascade
  without step 4 (nursing ends on arrival); `follow_up.kind = 'booked'`; `receiving_ward_id` recorded on the
  intake. A caller sending none of the new fields gets exactly the old behaviour.
- `ha-services-hub` (ops-wards): `allocate_admission_bed`, `confirm_arrival`, `release_admission_bed` for ward
  staff (`assertWardWorker` unchanged); plain `release_bed` now refuses an arriving bed (it is cancelled with its
  admission instead).
- `ha-book-on-behalf`: `origin` (`reception` default, or `clinician`).

**The shared state model:** `BED_STATES` gains Arriving ("Arr"); `bedState()`, `stateCounts()`, the board's
derivation and both paints know it.

**Checks:** `tests/emr-db/encounter-closure.test.ts` on the PGlite lane, **10/10**: admission with a bed (one
transaction, the close, the event), the race on one bed (second refused, nothing written for it), a bed being
cleaned refused, a wait needs a reason, one open admission per patient, Arrived (the inpatient encounter opens
once; EU nursing ends, the ward's does not), cancel → waiting → re-allocate → end, the guards, RLS (a patient
can't read admissions; only the service role runs the functions) and the summary rules (held invisible, own
current shared only, kept as made, no client writes). `tsc` for the app and for the functions: clean.

**Apply order:** 0091 after 0090. Deploy `ha-complete-encounter`, `ha-services-hub` and `ha-book-on-behalf` after
0091 (the hub tolerates nothing missing here: its new ops call 0091's functions).

## STOP 3: The close dialog and going home

`components/emr/desk/close-visit.tsx` (`CloseVisitView`), mounted by the desk in a centred `EmrDialog` (`wide`)
when `ENCOUNTER_CLOSE_V2` is on (`p.close` set); off, the old sheet is untouched.

- **Prefilled from the Plan** (`lib/emr/closure.ts` `planStart`): "Plan: Admit · Medical ward 4B" heads the dialog;
  changing the outcome strikes it through and records `disposition_detail.plan_said`. Observe in EU leaves the
  outcome empty and says the visit stays open.
- **Home:** each active prescription of the visit with Continue at home / Stop now (stopped after the close:
  prescription `completed`, medication statement stopped, `stopped_rx` in the detail); the follow-up interval
  from the Plan, then real slots and clinic days of this department around that date (`fetchLines`, the booking
  app's own read, "You" first), booked through `ha-book-on-behalf` with `origin: 'clinician'`; no clinic → the
  review date on the interval's day, editable; "Come back if" in the clinician's own words.
- **Refer / transfer:** destination (required), reason, urgency, transport into `disposition_detail`, the keys the
  referral printout reads (the empty-print bug is fixed).
- **Died:** says no patient copy is made and that the cause-of-death record is not built.
- Warnings never block; the disabled button's reason is in words; "Close without completing…" kept.
- The Plan's ward list carries ids and, with `WARD_BUILDER` on, "4 free · 2 arriving · 9 occupied" (one count
  engine, `wardBedCounts`, by the board's own rule).

Screenshots (`docs/emr/closure/screenshots/`): `close-home-1440`, `close-home-booked-1440`,
`close-home-noclinic-1440`, `close-home-390`, `close-refer-1440`, from the fixture
`/styleguide/encounter-closure/[screen]` (synthetic data; off unless `MEDSYNC_FIXTURES=1`).

## STOP 4: Admission and the bed

**Doctor side:** the ward chips with counts; the ward's published floor drawn read-only by the board's own
`PlanView` with every state's word; free beds also as a list of buttons (keyboard and screen readers); never
another patient's name (`loadBedBoard(…, { patients: "none" })`); "Admit and wait for a bed" with the reason
(No free bed / Extra bed / On the floor / Other + words). **Admit and close visit** runs `admit_from_encounter`.
Where `WARD_BUILDER` is off the dialog says the ward gives the bed and no admission row is made (ADR 0198).

**Ward side** (built by a delegated agent, reviewed here): the Arriving bed panel (who, admitted by, held since,
**Arrived**, **Cancel…** with reason and "still needs a bed / no longer"), **Waiting for a bed** (wait time,
reason, admitter, **Give a bed**, remove with a reason), **Needs attention** (Arriving > 4 h, a proposed value),
"Put a patient in this bed" offering the waiting admissions first. Nurse and admin boards both.

**Elsewhere:** the Workspace row and timeline read "Admitted · {ward} · Bed {n}" or "… · waiting for a bed";
inpatient encounters are not idle-flagged; reception's expected and flow pages show the same label.

Screenshots: `close-admit-1440`, `close-admit-390`, `close-admit-wait-1440`, `board-arriving-1440`.

## STOP 5: The patient's copy

- `lib/patient/visit-summary.ts`: the one composer (pure); `lib/emr/read/visit-summary.ts` reads the record;
  `lib/emr/write/visit-summary.ts` recomposes on the server at share time, applies the removals by id (unknown
  ids ignored) and writes the decision as a new version.
- The copy step follows the close in the same dialog: the copy exactly as the patient reads it
  (`components/patient/visit-summary-view.tsx`, the same component the patient page and the printout use),
  "n items are restricted and never shown to patients", Remove / Put back per item, **Share with patient** or
  **Hold…** with a reason. A closed visit's desk shows **Patient copy** to share later or update ("Updated").
- `/patient/care` "Your visits" and `/patient/care/visits/[summaryId]` (delegated agent): own current shared copy
  only, `notFound()` otherwise; **Add to my medicines** checks the copy lists that prescription, refuses a
  cancelled one, inserts through the patient's RLS client, once per prescription.
- `/doctor/encounters/[id]/print/patient-copy`: the shared version on paper, or the copy as it would be shared.
- A death, an administrative closure and an encounter in error make no copy; a hospital without bed tracking reads
  "You were admitted to {ward}." with no waiting claim.

Screenshots: `copy-1440`, `copy-hold-1440`, `copy-1440-dark`, `patient-visit-390`, `patient-visit-1440`.

## STOP 6: Tests

| Suite                                                                      | What it proves                                                                                                                                                       |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/emr-db/encounter-closure.test.ts` (PGlite, 10)                      | 0091 on real SQL: atomic admission, bed race, cleaning bed refused, one open admission, arrival, cancel/re-allocate/end, guards, RLS, summary rules                  |
| `tests/patient/visit-summary.test.ts` (7)                                  | The composer; property over 300 seeded worlds: no restricted and no removed item ever reaches the copy; no differentials; no copy for death / administrative / error |
| `tests/emr/closure.test.ts` (9)                                            | Plan → outcome, Observe in EU, blockers, `disposition_detail`, follow-up dates, the co-sign rule, counts in words                                                    |
| `tests/patient/visit-medicine.test.ts`                                     | Add to my medicines: the copy lists the prescription; the tracker row as prescribed, no invented times                                                               |
| `tests/wards/admission-board.test.ts`, `tests/workspace/admission.test.ts` | Waiting list, who sees names, the 4 h threshold; inpatient not idle; the "Admitted · ward" label                                                                     |
| Updated invariants                                                         | 41 hub ops; audit-first before the admission function; six bed states with their words; six ward-staff ops                                                           |

The RLS lane for the two new tables runs on PGlite (above), not in `tests/rls/` (which needs a live Supabase).

## STOP 7: Ship check

Last run, 2026-10-03, in the worktree:

| Check                                           | Result                                                                                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsc --noEmit` (app)                            | exit 0                                                                                                                                       |
| `tsc -p supabase/functions/tsconfig.json`       | exit 0                                                                                                                                       |
| `npm run lint`                                  | exit 0                                                                                                                                       |
| `SKIP_ENV_VALIDATION=1 EMR_PGLITE=1 vitest run` | 332 files passed, 21 skipped; **8,337 tests passed**, 238 skipped, 0 failed                                                                  |
| `rm -rf .next && npm run build` (6 GB heap)     | exit 0                                                                                                                                       |
| axe on the fixture screens                      | clean for everything built here; the floor plan's divider groups carry a pre-existing `aria-prohibited-attr` (the ward builder's `PlanView`) |

### For the owner

1. **Apply `0091_encounter_closure.sql` (GATED)** after 0090: `cd ~/Desktop/medsync-closure && npm run db:migrate`
   (this worktree; it reads the main folder's `.env.local`). From the main folder it would say "No new
   migrations": that checkout stops at 0081. It only adds
   tables, columns, functions, policies and triggers, so it is safe while `main` is deployed.
2. **Deploy the Edge Functions** after 0091: `ha-complete-encounter`, `ha-services-hub`, `ha-book-on-behalf`
   (`npx supabase functions deploy <name> --use-api`). Without the new fields each behaves exactly as before.
3. **Turn on** `ENCOUNTER_CLOSE_V2` (needs `EMR_V1`; the Plan prefill needs `CLERKING_PLAN_V2`, beds need
   `WARD_BUILDER`), then `PATIENT_VISIT_SUMMARY` once the wording is signed.
4. **Decide / sign:** ADRs 0197–0203 (proposed); ADR 0201's "proceed and request" co-sign; the 4-hour Arriving
   threshold; all patient-facing wording (Appendix A of the prompt: headings, outcome sentences, hold, wait and
   cancel reasons).

### Known gaps (not built)

- The doctor's bed picker reads the ward once; a bed taken meanwhile is refused by the server in words, then the
  doctor picks again (no live subscription in the picker).
- "Admitted · ward" on the Workspace and reception reads the close's detail, so a visit closed as "waiting" keeps
  that word after a bed is given; the board itself is live.
- The board shows "Other" for an encrypted wait note without the note; the hospital admin's own boards have no
  "Admitted" label.
- No notification that a copy is ready (the dispatcher's kinds and copy are booking-shaped); household proxies do
  not see a dependant's copy; "Medicines to stop" lists only what was stopped at the close, not the Plan's
  reconciliation of home medicines.
- Spotted, not changed: `startEncounter` (`lib/emr/actions/encounter.ts`) reads `r.data.encounter_id`, but the
  Edge Functions answer `{ ok, data }`, so it returns no id.
