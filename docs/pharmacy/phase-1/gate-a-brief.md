# GATE A brief — the design choices every Phase 1 GATE A document follows

Working note for the GATE A documents (Step 1, docs only). The proposal, the wireframes, the hazard log and the
content annex all follow it. Where it differs from the prompt, the reason is a Step 0 finding (STOP-REPORTS.md).

## Owner's answers at STOP 0 (12 Oct 2026)

- Build on `main`. Lab Phase 1 has merged (PR #227): `downtime_periods`, `downtime_form_numbers`,
  `downtime_entries`, `downtime_drills` (0105), `lab_cutover` (second approver, 0105), the per-user realtime
  topic `user:<id>` with `private.notify_user` (0106).
- No Playwright: the local harness (PGlite + Next + CDP screenshots + axe), as in Phase 0.
- Supply races are closed in the database (advisory lock per line, row lock per batch, a balance guard trigger),
  proven sequentially in the PGlite lane, plus one real two-connection race test against the owner's dev Supabase.
- **A line version is the prescription row id.** A placed line never changes except its `state`.
- Numbers: migrations 0122–0146, ADRs 0260–0279.

## Facts from Step 0 that shape the design

- No structured quantity on any prescription line. Plan lines have a frequency code (stat, daily, 12h, 8h, 6h, 4h)
  and a course code (single, 3d, 5d, 7d, 14d, until_review); EMR-sheet lines have free text. Dose is text.
- No prescriber edit or cancel action exists for a placed line. Only co-sign withdrawal (→ cancelled) and visit
  close (→ completed) change `state`.
- Check answers live in `prescriptions.check_answers` (stop/check only, with an encrypted reason required by 0088).
- The prescribing list is the static TS catalogue (192 drugs, stable ids, no strength field; strength sits on
  regimens or in the name). Free text is refused. `controlled` is a draft flag on 8 drugs.
- No witness identity proof exists anywhere (resus takes a typed name).
- No signed-reference store holds per-hospital, versioned, two-signature sets.
- Patient identifiers: `patient_profiles.date_of_birth` (plain date, NOT NULL), `phone_encrypted` (NOT NULL) +
  `phone_hmac` blind index (nullable), `patient_code` (MedSync number). Pharmacy clients get name, number and
  age-and-sex words only.
- Dispensing points: `pharmacy_dispensing_points` (0121, unit of Pharmacy, `serves` window/wards/emergency/all).
  Hospital has `district` and `emergency_phone` only: no street address, no per-point phone. A person may hold
  several point affiliations; today's scope reads one.
- Hub heads: `department_heads` (effective-dated, substantive + acting) on any department or unit. A point's
  in-charge is a `department_heads` row on the point's unit; the Head of Pharmacy is one on the Pharmacy department.
- `/nurse/mar` is freehand; the line-linked MAR is `MarGrid` in the monitoring charts (chip mount point).
- `/patient/track/medications` is web only; `self_medications.source_prescription_id` exists (unique per patient).
- SMS: `SmsSender` interface; templates exist only in `ncd_sms_template` (NCD purposes only).
- No presence signal. No print events. No PDF dependency. Chroma tokens: `status-caution-*` (amber), `Pill`
  (neutral chip), grape (pharmacy and lab), plum (place, active nav).

## Choices proposed at GATE A (new D-decisions beyond the prompt's D-PH1-01 to 40)

- **D-PH1-41 A prescriber cancel action.** The prompt's "Stop this medicine" and "Change the prescription" need a
  cancel that does not exist. Proposed: one new prescriber action, `cancelPrescriptionLine` (state active →
  cancelled, coded reason, audited, prescribing permission for that patient). "Change" = the existing prescribing
  dialog places a new line, then the old line is cancelled; the link old → new is stored on the pharmacy's query
  event (`answered: changed`, `replaced_by`), not on the prescription. No column is added to `prescriptions`.
  Alternative: no prescriber change path in this slice; "Change" and "Stop" answers are then phone-only.
- **D-PH1-42 Witness and signer authentication.** A server action re-checks a second person's password and TOTP
  on a throwaway Supabase client that never touches the active session's cookies, and records
  `witness_user_id`, `method = 'password+totp'`, `attested_at`. Five failures lock the attestation for that action.
  A signer's "fresh second factor" is a new TOTP verify on their own session. Alternative: the witness confirms
  from their own device within a short window.
- **D-PH1-43 Signed sets store.** One table, `pharmacy_signed_sets` (hospital, kind, version, content jsonb,
  sha256, status draft/signed/retired, first and second signer with role, signed_at, an exception text where only
  one eligible person exists). CHECK the two signers differ unless the exception text is present. Content acts
  only when `signed`.
- **D-PH1-44 The stock answer's storage (Step 9).** Check-level answers (out, not stocked) are stored in
  `check_answers` with code `stock` and the prescriber's reason, as every check is. Every answer shown, Note-level
  included, is also written to a pharmacy-owned snapshot, `pharmacy_stock_answers` (prescription id, state,
  point, count time), in the placement transaction. No prescription column.
- **D-PH1-45 Several points per person.** The scope returns every pharmacy affiliation; the top bar chooser sets
  the acting point (a cookie per user, re-checked on every write); every event stores it.
- **D-PH1-46 Downtime, generalised once (DT-1).** `downtime_periods` shared as it is (one outage is one outage).
  `downtime_form_numbers` gains `workspace` ('lab' | 'pharmacy', default 'lab') and the pharmacy states `to_enter`
  and `complete`; `report_id` applies to lab numbers only; the guard trigger keeps the lab's transitions exactly
  and adds the pharmacy's (unused → to_enter → complete; unused → voided). One number space per hospital, shown
  as `DS-00031` on pharmacy sheets. `downtime_drills` gains `workspace` and `dispensing_point_id`. Lab tests run
  unchanged.
- **D-PH1-47 Query delivery.** On the existing `user:<id>` topic through a sibling of `private.notify_user` that
  sends the event `pharmacy` with `{kind, ref, at}` (no PHI). Polling fallback: the plan step and the doctor
  workspace re-read every 15 s when unsubscribed. `seen` is written when the recipient's client renders the query.
- **D-PH1-48 Message templates.** `ncd_sms_template` is generalised once (a `workspace` column and the three
  pharmacy purposes), keeping its two-approver CHECK and banned-term scan. NCD behaviour unchanged.

## Names (use these exactly)

Tables (all `pharmacy_` unless shared): `pharmacy_signed_sets`, `pharmacy_products`, `pharmacy_product_points`,
`pharmacy_national_list_editions`, `pharmacy_national_list_rows`, `pharmacy_medicine_links`, `pharmacy_batches`,
`pharmacy_stock_movements`, `pharmacy_counts`, `pharmacy_count_lines`, `pharmacy_reorder_levels`,
`pharmacy_stock_requests`, `pharmacy_batch_corrections`, `pharmacy_stockouts`, `pharmacy_line_events`,
`pharmacy_scope_entries`, `pharmacy_queries`, `pharmacy_query_events`, `pharmacy_handovers`, `pharmacy_supplies`,
`pharmacy_supply_reversals`, `pharmacy_supply_corrections`, `pharmacy_look_backs`, `pharmacy_identity_attempts`,
`pharmacy_print_events`, `pharmacy_slips`, `pharmacy_patient_notices`, `pharmacy_attestations`,
`pharmacy_controlled_entries`, `pharmacy_controlled_differences`, `paper_prescriptions`,
`paper_prescription_lines`, `pharmacy_golive`, `pharmacy_briefings`, `pharmacy_legal_answers`,
`pharmacy_pilot_notes`, `pharmacy_hospital_settings`, `pharmacy_stock_answers`.

Engines: `lib/pharmacy/catalogue.ts`, `lib/pharmacy/stock/**`, `lib/prescribing/pharmacy.ts` (getAvailability),
`lib/pharmacy/lanes.ts`, `lib/pharmacy/lines.ts`, `lib/pharmacy/review/**`, `lib/pharmacy/supply/**`,
`lib/pharmacy/controlled.ts`, `lib/pharmacy/print/**`, `lib/pharmacy/readiness.ts`, `lib/downtime/**` (generalised
from `lib/lab/downtime*`), `lib/pharmacy/signed-sets.ts`, `lib/auth/attest.ts` (second-person attestation).

Flags (per hospital, off by default): `pharmacyDispensing`, `pharmacyStockAnswer`, `pharmacyPatientList`,
`pharmacyDowntime`, on top of Phase 0's `PHARMACY_WORKSPACE`.

## House rules for every document

- en-GB. Sentence case. A pharmacy technician is never called a pharmacist. "Pharmacy Board of Uganda", never PSU.
- No clinical value: no medicine, dose, class, high-risk entry, reorder level or price is proposed. Fixtures use
  invented names ("Fixture tablet A", "Batch FX-001").
- No red. Amber caution with an icon and a word. No green. No left-edge bars. Pop-ups are centred dialogs
  (`EditorDialog`), never side sheets.
- Nothing is invented as signed: every string is `draft` unless Phase 0 already signed it (the six strings signed
  11 Oct 2026: the pharmacy notice, override caution, co-sign caution, not-continued caution, emergency notice,
  technicians' regulator).
