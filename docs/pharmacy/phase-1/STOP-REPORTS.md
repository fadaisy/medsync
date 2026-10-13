# Pharmacy Phase 1 — STOP reports

Prompt: [PROMPT-PHARMACY-PHASE-1.md](PROMPT-PHARMACY-PHASE-1.md). Branch `feat/pharmacy-dispensing`, worktree
`~/Desktop/medsync-pharm1`, cut from **`fix/pharmacy-signed-wording` @ `d3034372`**. That branch is `origin/main`
(`cf404abd`) plus one commit: the CSO's signature on the Phase 0 wording (see Q1).

---

## STOP 0 — Discovery and baseline (11 Oct 2026)

No product code changed. Added: this file, the prompt copy, `tests/pharmacy/phase-1-baseline.test.ts`, and the
claim in `docs/NUMBERS.md`.

### What needs an answer before Step 1

1. **Merge `fix/pharmacy-signed-wording`.** Phase 0 is on `main` (PR #226), but the commit carrying the CSO's
   signature is not. Without it, CS-5 keeps the pharmacy workspace off in production, which is why the
   pharmacy account lands on `/clinician`. This branch already contains that commit.
2. **Lab Phase 1 is not merged** (`feat/lab-safety-floor` is local, 0102–0106). That branch holds three things this
   slice was told to reuse: the shared downtime tables (DT-1), the PHI-free `user:<id>` channel, and readiness with
   a second approver. **Recommendation:** build Steps 2–6 on `main` now. Rebase onto lab Phase 1 once it merges,
   before Step 8 (downtime and going live). Step 5 delivers queries over the existing `workspace:<hospital>`
   channel, which is PHI-free (`{kind, at}`, 0069), so no new channel type is needed (Q10).
3. **Playwright is missing** (Q22, a STOP-and-flag item). **Recommendation:** keep the local harness from Phase 0
   (D-PH0-22): PGlite, `next dev`/`next start`, CDP screenshots, axe and scripted clicks. Adding Playwright is a new
   dependency, which the owner must approve.
4. **There is no way to run two transactions at once in a test** (Q22). **Recommendation:** make double supply
   and overdraw impossible in the database itself:
   - one SECURITY DEFINER function per supply, which takes `SELECT … FOR UPDATE` on the batch;
   - a unique index on (line, line version) for supplies;
   - a CHECK that the balance never goes below zero, enforced in that function.

   The PGlite lane would prove the refusals one transaction after another. One real race test would run in the
   `tests/rls` lane against the owner's dev Supabase (two postgres-js connections), when the owner runs it.

5. **There are no line versions, and no edit path either** (Q4). The prompt says to STOP only if an edit overwrites
   a line with no history. No edit exists at all: once placed, a line changes only its `state`. So the row id
   already names one version. **Recommendation for GATE A:** treat (prescription id) as the line version. A
   prescriber's change is a cancel plus a new line. Today a cancel happens only through a co-sign withdrawal or
   closing the visit, and this slice adds no prescriber action (Section 7, "no change to how a prescription is
   changed"). RQ-9 ("the prescriber changed it") then reads as "the line is no longer `active`".
6. **Numbers.** Section 7 asks for 25 migrations. The pharmacy held 0122–0139 (18). The claim is extended to
   **0122–0146**; ADRs stay **0260–0279** (20). Nothing above 0121 is used outside lab's 0102–0119.
7. **Counts need the production database** (Q6, Q7, Q16, Q17). The read-only SQL is below; please run it and
   paste the result. Q7's table goes in front of the CSO at GATE A.

### Q1 — Phase 0 on the branch

Present: permission map v1 (`data/pharmacy/permission-map.v1.json`, signed), `lib/pharmacy/access.ts`,
`computeQueue` (`lib/pharmacy/queue.ts`), `buildPrescriptionView` (`lib/pharmacy/prescription-view.ts`), the nav
registration (`lib/pharmacy/nav.ts`), `pharmacyChecksState` (`lib/pharmacy/check-state.ts`), the read log
(`identitiesFor(…, "pharmacy_prescription")` and `logChartAccess`), and the flag (`pharmacyWorkspaceLiveFor`,
`lib/pharmacy/feature.ts`, with CS-5's production gate). Phase 0 is merged; only the signature commit is pending
(item 1 above). **Not a STOP.**

### Q2 — R1 to R18

| #   | Verdict                | Evidence                                                                                                                                                                                                                                                                                                          |
| --- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Confirmed              | Six names in `lib/pharmacy/access.ts`; only `pharmacy.view`, to PHARMACIST and PHARMACY_TECH; granted by trigger inside the affiliation transaction (0098).                                                                                                                                                       |
| R2  | Confirmed              | `computeQueue`: one row per placement, lanes window/ward/open, never drops a row (`lib/pharmacy/queue.ts`).                                                                                                                                                                                                       |
| R3  | Decided                | D-PH0-08: `placement_id` + `placement_line` (0099).                                                                                                                                                                                                                                                               |
| R4  | Confirmed              | The signed field list in `buildPrescriptionView`; each open is logged. The client gets name, MedSync number and age-and-sex words only (`lib/emr/read/results.ts:58-100`).                                                                                                                                        |
| R5  | Confirmed              | `dispensingRecorded: false`, `interactionsChecked: false`; the notice cannot be dismissed (rx screenshot).                                                                                                                                                                                                        |
| R6  | Confirmed              | `pharmacy_dispensing_points` (0121), `serves` ∈ window/wards/emergency/all, written by the hub op `set_dispensing_point`.                                                                                                                                                                                         |
| R7  | Corrected              | Frequency (code in Plan, text on the sheet), `duration` (course code), `quantity` (text, sheet only) and `indication` (never written) all exist. Dose is text (`"<n> <unit>"`). Full list in Q3.                                                                                                                  |
| R8  | Corrected              | Twelve checks on a drug line (eleven on a fluid line), up to fifteen for signed emergency-origin drugs; 16 codes in all. Levels Stop/Check/Note plus passed/not applicable/not checked. Only Stop and Check answers are stored (`lib/prescribing/plan-checks.ts:387-541`). Interactions are always `not_checked`. |
| R9  | Confirmed              | `pharmacyAvailability()` returns `not_linked` (`lib/prescribing/pharmacy.ts:15-17`). Callers: `lib/emr/write/plan.ts:269`, `prescribe-dialog.tsx:408,578`. Static text at `prescribe-dialog.tsx:992-996` and `components/emr/desk/close-visit.tsx:733`.                                                           |
| R10 | Confirmed              | The list is the MS-RX-CAT-001 draft catalogue (192 drugs, TS, ids stable). `onEmhsluDraft` is the drafter's unverified belief and is read by nothing. Three emergency entries sign doses for **four** catalogue drugs (`formulary-regimens.ts:31-33,153-166`).                                                    |
| R11 | Corrected              | The CHECK is real (`0039:213-214`), but `emergency_administrations` is never written. The live record is the resus timeline payload, where the witness is a typed name with no proof of identity (Q9).                                                                                                            |
| R12 | Corrected              | `/nurse/mar` is a freehand form: it reads no MAR rows and writes the text `prescription_id`. The line-linked MAR is `loadMonitoring` → `MarGrid`, keyed by `emr_prescription_id`, which no app code writes yet. `/patient/track/medications` reads `self_medications` (web only).                                 |
| R13 | Confirmed open         | Gate CG unsigned (`lib/emergency/feature.ts:6-18`; PRD-SYMPTOM-CATALOG-EMERGENCY §394,438).                                                                                                                                                                                                                       |
| R14 | Not merged             | Only on `feat/lab-safety-floor` (0105 downtime, 0106 `user:<id>`, `lib/lab/cutover.ts` second approver).                                                                                                                                                                                                          |
| R15 | Confirmed              | `SmsSender` (`lib/notifications/sink.ts:50-63`), Africa's Talking, `ncd_sms_template` with two approvers, `live_sms_enabled`, banned-term scan (`lib/ncdreg/recall/banned.ts`). NCD-specific except the sender.                                                                                                   |
| R16 | **Wrong**              | Booking prices exist: `service_lines.fee_ugx/deposit_ugx/payment_posture`, `service_line_fees` (ADR 0092), `appointments.quoted_fee_*`. No payment status, insurance or exemption anywhere, and no price in prescribing or pharmacy.                                                                              |
| R17 | Confirmed              | `app/doctor/encounters/[encounterId]/print/prescription/page.tsx`: prescriber, cadre, signature line. Cancelled and completed lines are **not** filtered out of the print. No print event is recorded beyond the page-open access log.                                                                            |
| R18 | Confirmed, with nuance | Two narrow stores: `notification_dispatches` (booking kinds) and `sa_notifications` (superadmin, triage and resus kinds; no web reader). Each new kind needs a CHECK migration.                                                                                                                                   |

### Q3 — The prescription model

- **Grouping:** `placement_id` + `placement_line` (0099). Older rows fall back to (encounter, prescriber, created_at).
- **Columns** (`db/schema/prescribing.ts:59-132` + 0099): id, hospital_id, encounter_id, patient_user_id,
  prescriber_user_id, prescriber_cadre, drug_id, drug_name, dose, concentration, route, method, frequency, duration,
  quantity, indication, source, infusion_over, diluent, prn, start, kind (drug/fluid), fluid_purpose, volume_ml,
  over_minutes, giving_set_drops_per_ml, warmed, controlled, is_emergency, sensitivity, confirmed_flags,
  check_answers, confirm_reason_ciphertext, condition_id, regimen_id, edits, client_key, medication_statement_id,
  state, placement_id, placement_line, created_at, updated_at.
- **Structured or text:**

  | Field     | Plan (step 10)                                                                                     | EMR sheet               |
  | --------- | -------------------------------------------------------------------------------------------------- | ----------------------- |
  | Dose      | number + unit, flattened to the text `"<n> <unit>"` on write (`lib/emr/write/plan.ts:194-195,305`) | `"<n> mg"` or free text |
  | Strength  | from the regimen only                                                                              | free text               |
  | Route     | enum                                                                                               | enum                    |
  | Frequency | code (stat, daily, 12h, 8h, 6h, 4h) + `prn`                                                        | free text               |
  | Duration  | code (single, 3d, 5d, 7d, 14d, until_review)                                                       | free text               |
  | Quantity  | **never written**                                                                                  | free text               |

  **There is no structured quantity anywhere.** A refill date can come only from a supply, never from the prescription.

- **States:** the CHECK allows active, administered, completed, cancelled. Code writes:
  - `active` on insert;
  - `cancelled` from the co-sign return (`lib/emr/write/prescriptions.ts:295-299`);
  - `completed` from visit close (`lib/emr/write/encounter.ts:251-275`).

  Nothing writes `administered`. A withheld co-sign is computed when read; the row itself is not changed.

### Q4 — Changing or cancelling a line

There is no edit, amend, replace or "stop this medicine" action for a placed line, and no version column. After
placement the problem card and Medicines are read-only (`problem-card.tsx:572-577`, `medicines.tsx:216-237`). See
item 5 above. **Found while reading:** the admission-medicine "Stop/Hold" acts on `medication_statements` only. A
`prescribed_here` statement can therefore be stopped while its prescription stays `active` (from reading the code;
not run).

### Q5 — The check store

- **Where answers are kept.** Per line: `check_answers` (jsonb `[{code, answer, outcome}]`), `confirmed_flags`, and
  `confirm_reason_ciphertext` (encrypted override and witness text). Titles are in `lib/prescribing/plan-checks.ts:31-47`
  and are mirrored in `lib/pharmacy/checks.ts`.
- **Can it hold the stock answer?** Yes, with no schema change: the jsonb has no content constraint. One condition
  comes from 0088's CHECK `check_answers = '[]' OR confirm_reason_ciphertext IS NOT NULL`: a stored stock answer
  must have a reason. That already holds, because only Stop and Check answers are stored. "Out" is Check level, so
  the prescriber's answer carries a reason. "Low" is a Note and "in" passes, and neither is stored, the same as
  every other note.
- **Proposed at GATE A:** store a stock answer only when it is a Check. For "what the prescriber saw" on
  low and in-stock lines, the pharmacy keeps its own snapshot table. No column is added to `prescriptions`.
- **Latent bug found:** an old answer for a check that has since become a Note leaves an empty reason. That gives a
  null ciphertext with a non-empty `check_answers`, so the insert fails the CHECK (`plan.ts:289-292,334`). Reported,
  not fixed: it is prescribing code outside this slice.

### Q6 — The prescribing list

- **Source and ids:** a static TS list, `FORMULARY_DRUGS` (192), generated from `data/prescribing/drug-catalogue.v0.json`.
  Ids are stable strings. The list is global: no hospital key and no table.
- **Fields:** id, generic, class, routes, methods, `presentationsDraft` (forms, no strengths), allergy groups, flags
  {renal, hepatic, weight-based, controlled, highAlert, NTI, reserveAntibiotic}, dose, `onEmhsluDraft`.
- **Strength:** lives only on regimens or in the name. Fluids have one id per strength.
- **Free text:** refused by both writers (`plan.ts:211-212`, `prescriptions.ts:169-171`). Lines naming a medicine
  not on the list therefore number **0 by construction**; SQL A lists the distinct ids to confirm it.
- **`controlled`** comes from `drug.flags.controlled`, which is set on 8 drugs: tramadol, codeine, morphine,
  pethidine, phenobarbital, diazepam, lorazepam, midazolam. These are draft flags, not a signed class.
- **National list:** nothing keys the list to the EMHSLU.
- **For Section 7:** `pharmacy_products.medicine` must key to these catalogue ids. National-list rows are a new
  import.

### Q7 — Lane reasons over 30 days

**Owner SQL B** (below). From the stored facts:

- **Overridden stop:** an answer with outcome `stop`, or the legacy `allergy` code.
- **Controlled:** `controlled`.
- **Child:** the `child` code.
- **Renal:** the `kidney` code. This is stored only when no creatinine was on record. A renal drug with a creatinine
  note leaves no trace.
- **Pre-set dose changed:** a regimen with non-empty `edits`.
- **Typed dose:** a drug line with a problem and no regimen.
- **Signed high-risk list:** none exists. `flags.highAlert` (37 drugs) is a draft and is not on the row. This
  column is 0 until the list is signed.

### Q8 — Dispensing points

- **They exist:** `pharmacy_dispensing_points` (0121), units of the Pharmacy department.
- **Staff assignment:** through the affiliation's `department_id` (the unit). Uniqueness is (user, hospital,
  department, role), so one person may hold several points.
- **Gap:** `requirePharmacyScope` takes the newest affiliation only (`lib/pharmacy/scope.ts:106`). The 5.1 point
  chooser is new work.
- **Order:** the hub lists departments by name; there is no sort column.
- **Address and phone:** the hospital holds `district` and `emergency_phone` only. There is no street address and
  no phone per point, so a point phone goes in a new column (Section 7, "the phone number if the hub does not hold one").

### Q9 — Witness identity

- **No witness proves who they are.** The resus prescribe action takes `witnessUserId?` or `witnessName?`, but the
  UI sends only a typed name of 2 or more characters (`app/nurse/resus/actions.ts:1154-1194`; dialog `:690-700`).
  Plan prescribing folds a typed witness into the reason text.
- **No step-up exists for a second person.** ADR 0280's several accounts in one browser is a switch of the active
  account, not an attestation.
- **Reusable as is: no.** GATE A option (D-decision): a server action checks the witness's password and TOTP on a
  throwaway client without touching the active session. It records `witness_user_id` and
  `authenticated_by = 'password+totp'`.

### Q10 — Delivery

- **Broadcast topics:** five private topics, each fed by a SECURITY DEFINER trigger through `realtime.send`:
  `resus:<episode>`, `resus-board:<hospital>`, `workspace:<hospital>`, `chart:<patient>`, `ward-beds:<hospital>`.
  All payloads are PHI-free.
- **Other channel:** one `postgres_changes` channel, `pre-arrivals:<facility>`.
- **Per-user channel:** none here; `user:<id>` is in lab 0106, unmerged.
- **Polling:** 15 s without a channel, 5 min with one, paused while hidden (`use-workspace-live.ts`).
- **Lab criticals delivery:** not merged.
- **Plan:** a pharmacy query fires `workspace:<hospital>` `{kind:'pharmacy_query'}`. The prescriber's open
  workspace refreshes, which meets the 5 s budget with realtime and 15 s with polling.

### Q11 — SMS

- **What exists:** the `SmsSender` interface, `createAfricasTalkingSender` (null when unconfigured) and
  `sendGuarded`, which logs to `ncd_sms_log`. Templates live in `ncd_sms_template`: per facility, two purposes only,
  `first_approver <> approved_by`. The live setting is `ncd_facility_settings.live_sms_enabled` (false by default).
- **Banned-term scan:** `lib/ncdreg/recall/banned.ts` (fixed words, medicine labels, codes, ATC codes, catalogue
  terms).
- **Patient phone:** `patient_profiles.phone_encrypted` (NOT NULL), with the blind index `phone_hmac` (nullable,
  backfill script).
- **Consent:** `consent_records` `sms_communication` with `revoked_at`, plus `sms_opt_outs`.
- **For Phase 1:** the template store is NCD-only, so pharmacy templates need a pharmacy copy of the pattern, or
  a generalised store. To be proposed at GATE A.

### Q12 — Four-eyes and signed references

- **Four-eyes:** each mechanism belongs to one domain:
  - hub `capability_values`: pending and verified, author ≠ verifier checked in app code;
  - `sa_pending_approvals`: superadmin only, a fixed list of actions;
  - NCD `ncd_go_live_request` and `ncd_definition_version`: DB CHECK author ≠ approver.
- **Signed references:** code or JSON with `status`, `signedBy` and `signedOn`, signed by a commit, with one signer
  (`RefEntry`, `SignedCopy`, `permission-map.v1.json`).
- **Can the store hold per-hospital, versioned, two-signature sets?** No (E-PH1-07). **Proposal:** one table,
  `pharmacy_signed_sets`:
  - (hospital, kind, version, content jsonb, sha256, status, cso_signed_by, pharmacist_signed_by);
  - CHECK that the two signers differ;
  - modelled on `ncd_definition_version`.

### Q13 — `/patient/track/medications`

- **Where:** web route only; no Expo screen.
- **Tables:** `self_medications` (with `source_prescription_id`, unique per patient, 0091) and
  `self_medication_takes`. RLS is own-row.
- **How entries are created:** by hand, or by "Add to my medicines" on a visit summary (`selfMedicationFromPrescription`).
- **Contract from a supply:** reuse that mapper, insert as the patient or through a definer function, one row per
  prescription.
- **Gate CG:** open. It governs mobile clinical writes and patient record access. Whether the web list counts is a
  GATE A question (Step 9 is deferrable, D-PH1-40).

### Q14 — `/nurse/mar`

- **What it reads:** nothing. It is a freehand administer form; the text `prescription_id` goes through
  `ha-administer-medication`.
- **The line-linked MAR:** `MarGrid` via `loadMonitoring` (`emr_prescription_id`, 0088). No app code writes it yet.
- **Chip mount:** the row header in `components/emr/chart/graphs/mar-grid.tsx:43-51`. It renders on the nurse
  patient page (`nurse-monitoring.tsx:70`, behind `clerkingPlanV2LiveFor`) and in the doctor's plan step (`plan-step.tsx:517`).

### Q15 — Problem card, plan step, lanes

- **Chip:** beside the "Prescribed" tag at `components/clerking/plan/problem-card.tsx:573`, and at `medicines.tsx:219-236`.
- **Answer form:** below that `<li>`.
- **Data:** add a field to `PlacedRx` (`lib/clerking/plan/record.ts:24-40`, built in `lib/emr/read/plan.ts:93-116`).
- **Count:** in the step header next to `PlanStatusPill` (`clerking-desk.tsx:1138`).
- **Lanes:** `lib/workspace/lanes.ts` (not `app/doctor/_lib/features.ts`). A query count is a new `FlowTask` kind fed
  from `lib/workspace/queries.ts`, shown as a badge (`flow.ts:~930`). Hotkeys 0–9 are all taken.

### Q16 — Prescriber and responsible clinician

- **Prescriber:** `prescriptions.prescriber_user_id` + `prescriber_cadre`.
- **Responsible clinician:** `encounters.clinician_user_id` (NOT NULL, set by triage assignment). There is no
  attending or care-team table.
- **Missing:** possible only when the encounter is gone (ON DELETE SET NULL) or an affiliation has lapsed. Count
  with **owner SQL C**.

### Q17 — Patient identifiers

- **Where held:** `patient_profiles`:
  - name: `first_name_encrypted` / `surname_encrypted`, AES via `lib/encryption.ts`;
  - `date_of_birth`: a plain `date`, NOT NULL;
  - phone: `phone_encrypted` (NOT NULL), with the blind index `phone_hmac`;
  - MedSync number: `patient_code`, plain and unique.
- **Server-side comparison (SU-4):**
  - date of birth: compare in SQL;
  - phone: `blindIndex(typed) = phone_hmac`, with a decrypt-and-compare fallback where `phone_hmac` is null.

  The stored value never goes to the client.

- **Phase 0's read model:** sends neither a date of birth nor a phone number, only age-and-sex words.
- **"Neither a date of birth nor a phone number":** 0 by schema, as both are NOT NULL. **Owner SQL D** counts
  missing blind indexes, which decide whether the fast path works.

### Q18 — Restricted classes

- **Tagging:** on `drug_class_tags`, terms and concepts, copied onto conditions and statements. Prescriptions are
  always `standard`, and the formulary has no sensitivity field.
- **Filtering:** patients are filtered by RESTRICTIVE RLS (0074) and the visit-summary composer. Clinicians see a
  restricted flag. The pharmacy shows a restricted problem as written.

### Q19 — Downtime

Not on this branch. The lab's version is unmerged and lab-specific by path and name (`lib/lab/downtime-*`, 0105). DT-1
asks for one shared module, so Step 8 waits for lab Phase 1 to merge and then generalises it (item 2).

### Q20 — Print

- **Print CSS:** `components/emr/print-layout.tsx` (A4, page boxes, "Page x of y") and `print-toolbar.tsx`
  (`window.print()`).
- **No PDF dependency.**
- **No print event:** only the page-open access log (`surface = emr_print_*`, no prescription ids). Phase 0 shows
  "Printed: Not recorded in MedSync".
- **"Changed since printing" (PQ-7):** cannot be computed; it was not built.

### Q21 — Presence

None: no heartbeat, `last_seen` or Realtime presence. The "supply without a pharmacist" control (5.3) therefore relies
on the recorded reason and the look-back list.

### Q22 — Test tooling

- **Playwright:** absent (item 3).
- **axe-core:** present.
- **Fake clock:** `vi.useFakeTimers` / `setSystemTime`, or injected `now`.
- **Two transactions at once:** none (item 4).
- **Lanes:** Vitest 4 with `fileParallelism: false`. The PGlite lane is `EMR_PGLITE=1`, one in-process connection.

### Q23 — Numbers

- **Highest on `origin/main` and every branch:** migration **0121**, ADR **0280** (`feat/multi-account`, merged).
  Lab Phase 1 holds 0102–0119 / ADRs 0239–0259.
- **Claimed for this slice:** migrations **0122–0146**, ADRs **0260–0279**. Recorded in `docs/NUMBERS.md`.

### Q24 — Tokens

- **Chroma is present** (ADR 0162).
- **Amber caution pair:** `bg-status-caution-bg` / `text-status-caution-fg`. Phase 0's `CautionNotice` uses it.
- **Neutral chip:** `components/ui/pill.tsx`.
- **Pharmacy and lab colour:** grape (`--color-grape-*`).
- **Place colour:** plum (`--color-plum-*`, ADR 0097).

### Q25 — Service-role key

- **Still read:** `lib/supabase/service.ts:17` reads `SUPABASE_SERVICE_ROLE_KEY` (validated in `lib/env.ts:16`).
- **Legacy or new:** the code cannot tell whether the value is the legacy JWT `service_role` key or a new
  `sb_secret_…` key. **Flagged:** the owner should check which key is set in Vercel. If it is the legacy JWT,
  rotating to a secret key is a separate change.

### Prompt-versus-repo differences (summary)

1. R7, R8, R11, R12 and R16 were corrected above.
2. **No line versions or edit path (Q4).** RQ-9 and SU-2 are read against `state`.
3. **No structured quantity (Q3).** The refill date and "days covered" can come only from the supply's typed
   quantity, with the frequency code where one exists.
4. **No authenticated witness to reuse (Q9).**
5. **No signed-set store for per-hospital, two-signature lists (Q12).** One new table.
6. **No per-user channel, downtime or second-approver readiness on `main` (Q10, Q19).** They depend on lab Phase 1.
7. **No per-point phone or hospital address (Q8).**
8. **A viewer can hold several points, but the scope reads one (Q8).**
9. **Booking prices exist (R16).** The pharmacy price stays its own recorded fact, as Section 7 says.
10. **Lane reason "signed high-risk list": no signed list exists (Q7).**
11. **Found outside the slice, reported, not fixed:**
    - (a) Stop/Hold on a `prescribed_here` statement leaves the prescription `active` (Q4).
    - (b) A stale answer can make a Plan insert fail CHECK 0088 (Q5).
    - (c) The doctor's prescription print includes cancelled and completed lines (R17).
    - (d) `lib/supabase/accounts.ts:14` (ADR 0280, on `main`) builds its cookie name from
      `NEXT_PUBLIC_SUPABASE_URL` at import time. With no URL set, three test files fail to load
      (`tests/auth/accounts.test.ts`, `tests/ncdreg/interlocks-static.test.ts`,
      `tests/workspace/assignment-visit.test.ts`); all pass with a fixture URL.

### Failing tests (the gap, `it.fails`, green while the gap exists)

`tests/pharmacy/phase-1-baseline.test.ts`, 4 expected fails:

- a prescription line can end in a recorded pharmacy outcome (no `lib/pharmacy/lines.ts`, no `pharmacy_line_events`);
- a supply names a batch and moves stock (no `pharmacy_supplies`, no `pharmacy_stock_movements`);
- the availability seam answers from stock where a hospital holds it (it answers `not_linked`);
- a hospital with a live dispensing point records dispensing (`dispensingRecorded` is always false).

### Baseline checks (`d3034372`)

| Check                            | Result                                                                                                                                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck` (app + Edge) | exit 0                                                                                                                                                                                                                        |
| `vitest run`                     | 8,896 passed, 4 expected fail, 977 skipped, 1 failed. The failure is `si-profiles-render` timing out at 120 s under load (passes alone). Three files fail to load for 11(d). With a fixture URL, all 4 files pass (17 tests). |
| PGlite lane (`tests/emr-db`)     | 34 files, 549 passed                                                                                                                                                                                                          |

### Baseline screenshots (`~/Desktop/pharm0-harness/shots/p1-stop0/`)

| Surface                                              | Files                                 | What it shows today                                                                                                                             |
| ---------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0 queue                                        | `queue-1440.png`                      | Nine prescriptions, read-only                                                                                                                   |
| Phase 0 prescription view                            | `rx-1440.png`                         | Three lines as written; the notice "MedSync does not record dispensing yet"; "Stock. The prescriber saw 'Pharmacy not linked yet'"; "Read-only" |
| Problem card with prescribed lines (doctor, step 10) | `doctor-plan-{1440,834,390}.png`      | Each line carries only "Prescribed". There is no pharmacy state                                                                                 |
| Administration record                                | `mar-{1440,834,390}.png`              | "Pick a patient first … you record administration freehand"                                                                                     |
| Patient's medicine list                              | `patient-meds-{1440,834,390}.png`     | "No medicines yet", for the same patient who has three prescribed lines                                                                         |
| Encounter header                                     | `doctor-encounter-{1440,834,390}.png` | Step 1 of the closed fixture visit                                                                                                              |

**Not shot:** the open prescribing dialog's Check step. The fixture visit is closed, so the dialog does not open.
The string is at `components/clerking/plan/prescribe-dialog.tsx:992-996`, and the pharmacy view quotes it. It will be
shot on an open fixture visit at Step 9, when the string changes.

**Harness changes** (local, not in the repo):

- fixture patient 9 holds a `patient` role, is active, and has accepted the current data-processing notice;
- `start.sh` passes the clerking and prescribing flags through.

### The "before" run (scripted, fixture data)

The prescriber (Medical officer, Diabetes clinic) placed three medicines for an outpatient, Patient Nine-9 (fixture
tablets A and B and capsule C, one with an allergy stop overridden). After that:

- **The pharmacy** sees the prescription in the queue and can open it. It can record nothing. The screen says
  MedSync does not record dispensing.
- **The doctor** sees "Prescribed" on each line, and nothing about whether it was supplied, owed or out of stock.
- **The patient** sees "No medicines yet" on their medicine list, and nothing from the visit until a summary is
  shared.

**None of them can tell from MedSync whether any of the three medicines was supplied.** The run used seeded
placements rather than live clicks, because the harness blocks Server Actions in screenshot runs.

### Owner SQL (read-only; production; paste the results back)

**A — Q6, the prescribed ids over 30 days**

```sql
SELECT drug_id, count(*) AS lines
FROM public.prescriptions
WHERE created_at >= now() - interval '30 days' AND is_emergency = false
GROUP BY drug_id ORDER BY lines DESC;
```

**B — Q7, lane reasons per placement**

```sql
WITH line AS (
  SELECT p.hospital_id,
         coalesce(p.placement_id::text, concat_ws('|', p.encounter_id, p.prescriber_user_id, p.created_at)) AS placement,
         CASE WHEN p.check_answers <> '[]'::jsonb THEN p.check_answers
              ELSE (SELECT coalesce(jsonb_agg(jsonb_build_object('code', f)), '[]'::jsonb)
                    FROM jsonb_array_elements_text(p.confirmed_flags) f) END AS answers,
         p.controlled, p.kind, p.condition_id, p.regimen_id, p.edits
  FROM public.prescriptions p
  WHERE p.is_emergency = false AND p.created_at >= now() - interval '30 days'
), flag AS (
  SELECT hospital_id, placement,
    EXISTS (SELECT 1 FROM jsonb_array_elements(answers) a
            WHERE a->>'outcome' = 'stop'
               OR (coalesce(a->>'outcome','') NOT IN ('stop','check') AND a->>'code' = 'allergy')) AS r_stop,
    controlled AS r_controlled,
    EXISTS (SELECT 1 FROM jsonb_array_elements(answers) a WHERE a->>'code' IN ('child','paediatric_routing')) AS r_child,
    EXISTS (SELECT 1 FROM jsonb_array_elements(answers) a WHERE a->>'code' = 'kidney') AS r_kidney,
    (regimen_id IS NOT NULL AND edits <> '[]'::jsonb) AS r_preset_changed,
    (condition_id IS NOT NULL AND kind = 'drug' AND regimen_id IS NULL) AS r_typed_dose
  FROM line
), pl AS (
  SELECT hospital_id, placement, bool_or(r_stop) r_stop, bool_or(r_controlled) r_controlled,
         bool_or(r_child) r_child, bool_or(r_kidney) r_kidney,
         bool_or(r_preset_changed) r_preset_changed, bool_or(r_typed_dose) r_typed_dose
  FROM flag GROUP BY hospital_id, placement
)
SELECT h.name AS hospital, count(*) AS placements,
  count(*) FILTER (WHERE r_stop) AS overridden_stop,
  count(*) FILTER (WHERE r_controlled) AS controlled,
  count(*) FILTER (WHERE r_child) AS child_check,
  count(*) FILTER (WHERE r_kidney) AS renal_check,
  count(*) FILTER (WHERE r_preset_changed) AS preset_dose_changed,
  count(*) FILTER (WHERE r_typed_dose) AS typed_dose,
  count(*) FILTER (WHERE r_stop OR r_controlled OR r_child OR r_kidney OR r_preset_changed OR r_typed_dose) AS any_reason
FROM pl JOIN public.hospitals h ON h.id = pl.hospital_id
GROUP BY h.name ORDER BY placements DESC;
```

**C — Q16, prescriber and responsible clinician**

```sql
SELECT h.name AS hospital, count(*) AS lines,
  count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.staff_affiliations sa
      WHERE sa.user_id = p.prescriber_user_id AND sa.hospital_id = p.hospital_id
        AND sa.state IN ('active','approved'))) AS prescriber_no_active_affiliation,
  count(*) FILTER (WHERE e.id IS NULL) AS no_encounter,
  count(*) FILTER (WHERE e.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.staff_affiliations sa
      WHERE sa.user_id = e.clinician_user_id AND sa.hospital_id = p.hospital_id
        AND sa.state IN ('active','approved'))) AS clinician_no_active_affiliation,
  count(*) FILTER (WHERE e.id IS NOT NULL AND e.clinician_user_id <> p.prescriber_user_id) AS prescriber_is_not_encounter_clinician
FROM public.prescriptions p
JOIN public.hospitals h ON h.id = p.hospital_id
LEFT JOIN public.encounters e ON e.id = p.encounter_id
WHERE p.created_at >= now() - interval '30 days' AND p.is_emergency = false
GROUP BY h.name;
```

**D — Q17, identifiers of patients with a recent prescription**

```sql
SELECT count(DISTINCT pp.id) AS patients,
  count(DISTINCT pp.id) FILTER (WHERE pp.phone_hmac IS NULL) AS phone_not_indexed
FROM public.prescriptions p
JOIN public.patient_profiles pp ON pp.id = p.patient_user_id
WHERE p.created_at >= now() - interval '30 days';
```

**STOP 0.** Waiting on:

- the answers to items 1–6 (the recommendations stand unless you say otherwise);
- the results of SQL A–D.

Step 1 (the GATE A proposal) also needs the **pharmacist reviewer's name** and **interim answers to legal
questions 1–6** (Appendix E). Without them STOP 1 cannot be signed.

### Owner's answers to STOP 0 (12 Oct 2026)

- **Item 1:** `fix/pharmacy-signed-wording` merged (in PR #228 with this branch's STOP 0 commit). The owner reports
  the pharmacy workspace live in production.
- **Items 2 to 6:** "go with your recommendation". Recorded as decided: build on `main`; the harness instead of
  Playwright; supply races closed in the database, proven sequentially in PGlite, with one real race test for
  the owner's dev Supabase; a line version is the prescription row id; migrations 0122–0146 and ADRs 0260–0279.
- **Item 2 overtaken:** lab Phase 1 merged to `main` as PR #227 the same day (0102–0106, ADRs 0239–0250). Its
  downtime tables, the per-user topic `user:<id>` (`private.notify_user`, 0106) and the second-approver
  cut-over (`lab_cutover`, 0105) are therefore on this branch from Step 1. GATE A builds on them directly (DT-1,
  E-PH1-06), not after a later rebase.
- **SQL A–D:** not yet returned. Q7's counts are marked "awaiting" in the GATE A proposal.

---

## STOP 1 — GATE A proposal (12 Oct 2026)

Documents only, commit `797a3ac6`.

| Document                                     | What it holds                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [gate-a-proposal.md](gate-a-proposal.md)     | Prompt-vs-repo changes (D-PH1-41 to 49); access; the LO-4 diagram with 30 worked moves and the two-point race; lanes with three reason sets over six fixtures; the ledger's worked day; queries and delivery; schema diff 0122–0131; RLS probe plan; concurrency plan; test plan; rollout; ADR drafts 0260–0279; the decision table and signature block |
| [gate-a-wireframes.md](gate-a-wireframes.md) | Every screen of Section 5, annotated, with 5.14's differences as built; tablet and phone behaviour                                                                                                                                                                                                                                                      |
| [gate-a-content.md](gate-a-content.md)       | 115 strings (6 signed in Phase 0, 109 draft) with signers; 19 blank sign-off packs; the legal sheet; permission map v2 (draft JSON)                                                                                                                                                                                                                     |
| [hazard-log.md](hazard-log.md)               | 59 hazards (43 from Appendix C, 16 added), each with control, proving test and residual risk                                                                                                                                                                                                                                                            |
| [gate-a-brief.md](gate-a-brief.md)           | The design choices every GATE A document follows                                                                                                                                                                                                                                                                                                        |

**Stage 1 critique, two passes.** The first pass added the replacement-line grouping and a home for the
prescriber's cancel reason. The second folded in what the annexes found:

- W1–W11, from drawing the screens;
- H1–H8, from the hazard log;
- C1–C4, from the strings.

H1 was corrected against the code: visit close sets `completed` only on lines the prescriber chose not to
continue, so a `completed` line is never supplied.

**STOP 1. Nothing proceeds until all three are on record:**

1. **The CSO's decision on every row of the proposal's §14** (D-PH1-01 to 49, E-PH1-01 to 13).
2. **The pharmacist reviewer's name.** They co-sign the rows marked PR, the clinical packs and the hazard log.
3. **An interim written answer to legal questions 1 to 6:** for each, a document reference, who gave it and the
   date. None is on record. D-PH1-03, 05, 13, 17, 26 and 28 cannot be signed without them.

Also still open: owner SQL A–D from STOP 0. Q7's lane counts are needed for D-PH1-04.

### Owner's answers to STOP 1 (12 Oct 2026)

Through the GATE A decisions page (https://claude.ai/artifact/LVDHizt73bKagVvHZNQn7D):

- **All 63 decisions approved as recommended, no changes.** That is D-PH1-01 to 49, E-PH1-01 to 13, and the §1
  corrections. Seven are provisional until their legal answer: D-PH1-03, 05, 13, 17, 26, 28 and 31.
- **Pharmacist reviewer:** none for now. The CSO signs alone. A registered pharmacist co-signs the clinical packs
  and the hazard log before any production point goes live. The owner asked whether Claude could be the reviewer;
  it cannot stand as one, because it is not a registered pharmacist. It does the review work, and that is recorded
  as such.
- **Legal questions 1 to 6:** deferred. Building continues at the test hospital. No production point can be
  switched on until all six interim answers are on record (RD-1 condition 2).
- **Owner SQL A–D:** run by the owner; the results have not reached this report yet. D-PH1-04 was approved
  without Q7's counts in hand. The counts go into the lane-reasons pack when they arrive.

GATE A is signed for building. Step 2 (the data layer) proceeds.

---

## STOP 2 — Data layer (12 Oct 2026)

Nine migrations, the Drizzle mirrors, the permission map v2 and its access path, the four flags, the national list
dry run, and the lane tests. **No migration is applied**: all nine are GATED, for the owner to apply in order with
`npm run db:migrate`.

### The migration diff (0122–0130, 1,568 lines of SQL)

| Migration             | Adds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0122 foundations      | `private.pharmacy_cadre_permissions` (map v2 in SQL), `private.pharmacy_can_user` / `pharmacy_can` (`pharmacy.manage` from an open `department_heads` row on the Pharmacy department or a point, already audited by 0080); `pharmacy_signed_sets` (D-PH1-43: two signers or a written exception; signed content never changes; one signed per kind); `pharmacy_attestations` (D-PH1-42; no secret; never self for a witness)                                                                                                                                                                      |
| 0123 catalogue        | `pharmacy_products` (medicine = catalogue id; strength as on the pack, H2; price optional), `pharmacy_product_points`, national-list editions, rows and person-made links                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 0124 stock            | `pharmacy_batches` (first number and expiry kept; changes only beside a correction), `pharmacy_stock_movements` (append-only; the **guard** locks the batch row and refuses a live movement below zero or a live supply from an expired batch, month-only expiry to the month's end, Africa/Kampala date; downtime lets through), counts and count lines (blind: the recorded balance is stored with the line), reorder levels, requests between points, batch corrections, the stock-out projection; the issue unit locks after the first movement                                               |
| 0125 review           | `pharmacy_scope_entries`, `pharmacy_line_events` (append-only; lane snapshot; `replaced` names its new line), `pharmacy_queries` + `pharmacy_query_events` (append-only; a phone answer can only be "keep"); `private.notify_user_event` on `user:<id>` with `{kind, ref, at}`; `private.may_prescribe_here` (the co-sign policy, fail closed); prescriber read policies; `public.pharmacy_line_review_state` for the nurse's chip                                                                                                                                                                |
| 0126 supply           | `pharmacy_handovers` (identity route checked: two identifiers, identified another way, ward staff, or the sheet's own record; client key unique; one sheet row once), `pharmacy_supplies` (line or paper line; supplying point and organisation), and **Law 3 at commit**: a deferred constraint trigger on both tables requires exactly one matching `supplied` movement per supply and a supply for every `supplied` movement; reversals (fit or written off), corrections, look-backs, identity attempts (never the typed value), print events, slips (8–12 characters, no 0/O/1/I/L), notices |
| 0127 controlled       | `pharmacy_controlled_entries` (a supply needs the count, both attestations and the witness's agreed balance; the witness attestation must be passed, separate, for this actor, and under 30 minutes old), `pharmacy_controlled_differences` (only closing changes one)                                                                                                                                                                                                                                                                                                                            |
| 0128 downtime, shared | `downtime_form_numbers.workspace` + point + period + completion, the guard rewritten with the lab's moves unchanged; `downtime_drills.workspace` + point; `paper_prescriptions` + lines (append-only)                                                                                                                                                                                                                                                                                                                                                                                             |
| 0129 going live       | point `live_at`, `switched_off_at`, `label_mode`, `count_freshness_days`, `phone`; `pharmacy_golive` (second person; approval stamps the point in the same transaction); briefings, legal answers, pilot notes; `pharmacy_hospital_settings` (supply without a pharmacist refused without a second approver **and** an answer to legal question 1 on record, RQ-12)                                                                                                                                                                                                                               |
| 0130 prescribing side | `prescription_cancellations` (D-PH1-41; reason, optional "replaced by"), `prescription_print_events` (D-PH1-49)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**Code outside the new files:**

- **Lab:** three reads filter `workspace = 'lab'` (`lib/lab/downtime-read.ts`, `downtime-store.ts`,
  `cutover-store.ts`). Without the filter, a pharmacy sheet or drill would count on the lab's screens.
- **Pharmacy:** `lib/pharmacy/access.ts` adds `pharmacyDispensingAccess`, which reads map v2 outside production
  and v1 in production (D-PH1-03 is provisional). Phase 0's `pharmacyAccess` is untouched.
- **Flags:** `lib/pharmacy/feature.ts` adds `PHARMACY_DISPENSING`, `PHARMACY_STOCK_ANSWER`,
  `PHARMACY_PATIENT_LIST` and `PHARMACY_DOWNTIME`. Each is off by default, needs `PHARMACY_WORKSPACE`, and stays
  off in production while `PHARMACY_PHASE1_COPY_STATUS` is draft.

### The RLS probe table

All tables have RLS forced. `anon` and `authenticated` have no grant at all. Reads go through
`medsync_clinical_reader`; writes go through the owner in server actions.

From `tests/emr-db/pharmacy-dispensing-data.test.ts`: every row below is a probe over all 39 new tables.

| Actor                                                                | What they get                                                                                                                                |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Pharmacist, same hospital                                            | Every table, except `pharmacy_attestations` (in-charge only)                                                                                 |
| Pharmacy technician, same hospital                                   | The same rows as the pharmacist                                                                                                              |
| Pharmacist of another hospital, at their own hospital                | Only the three national-list tables (national reference data)                                                                                |
| Pharmacist of another hospital, claiming this hospital               | Nothing                                                                                                                                      |
| Prescriber who may prescribe here, for a patient they may see        | Queries, query events, line events, supplies, cancellations, print events. **Nothing** else: no product, batch, movement, count or stock-out |
| Nurse, reception, lab staff, hospital admin, superadmin, no identity | Nothing on any table                                                                                                                         |
| `anon`, `authenticated` (a pharmacist's own JWT)                     | Read refused, write refused, on every table                                                                                                  |
| `medsync_clinical_reader`, any identity                              | Write refused on every table                                                                                                                 |

The nurse's chip is `pharmacy_line_review_state(prescription)`. It returns one word to a reader who may see the
patient, and null to anyone else (probed with another hospital's pharmacist).

### Append-only, proved

UPDATE and DELETE are refused on each of the 28 event tables:

- as the table owner, by the trigger (the message names "append-only");
- as `service_role`, by the trigger, or by permission where the bootstrap grants none.

Covered:

- attestations;
- movements, counts, count lines, reorder levels, batch corrections;
- scope entries, line events, queries, query events;
- hand-overs, supplies, reversals, corrections, look-backs, identity attempts, print events, slips, notices;
- controlled entries;
- paper prescriptions and lines;
- briefings, legal answers, pilot notes;
- cancellations, print events.

The mutable tables each allow only their named moves:

- signed sets: draft → signed → retired;
- requests and differences: closing only;
- go-live: the decision only;
- batches: number and expiry, beside a correction;
- products: never the issue unit after stock has moved.

### Guarantees the lane proves

| Rule                                       | Probe                                                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| SL-4: no live movement below zero          | refused with "batch FX-LOW holds 3"                                                                       |
| DT-7: back-entry may go below zero         | recorded at −4                                                                                            |
| SL-5: no live supply from an expired batch | refused; a month-only expiry of Feb 2027 runs to 28 Feb 2027                                              |
| SL-3: one batch number per point           | refused                                                                                                   |
| SL-11: corrections keep the first values   | a bare change refused; with a correction, the first expiry stays beside the new one                       |
| CT-4: the issue unit locks                 | refused after a movement                                                                                  |
| Law 3: a supply and its movement together  | a supply alone, a movement alone, and a quantity mismatch each fail at commit; the pair commits           |
| SU-10: one hand-over per client key        | refused                                                                                                   |
| D-PH1-43: two signers                      | the same signer twice refused; with an exception it signs; then the content cannot change                 |
| PA2-3: manage from the hub                 | false → true with an open head row → false when it ends; a nurse's head row grants nothing                |
| RD-2: two people to go live                | self-approval refused; another's approval stamps `live_at`                                                |
| RQ-12: the legal gate                      | refused without question 1 on record; accepted with it                                                    |
| PA2-6: a separate witness                  | a self-attestation refused; another actor's attestation refused on the entry                              |
| D-PH1-46: sheet states                     | pharmacy: unused → to_enter → complete, and back refused; the lab's `entered` refused on a pharmacy sheet |
| SL-9: stock-outs                           | one opens at zero and closes on the next receipt                                                          |
| D-PH1-47: delivery                         | the prescriber's `user:<id>` topic gets event `pharmacy` with exactly `at, kind, ref`                     |

**Map v2 and SQL agree** (`private.pharmacy_cadre_permissions` equals `data/pharmacy/permission-map.v2.json`), in
both the lane and a static unit test.

### Backfill (dry run)

- **Map v2:** needs no backfill. Pharmacy staff already hold the carrier role from 0098, and their v2 permissions
  follow their cadre.
- **Who to re-check:** anyone approved since Phase 0's backfill. The Phase 0 dry run checks them:
  `npm run pharmacy:backfill-access` (lists only, writes nothing). For the owner to run against production.
- **`pharmacy.manage`:** granted by `department_heads` rows, already audited.

### The national list import (dry run)

- **Built:** `scripts/pharmacy/import-national-list.ts` reads an edition's CSV and reports, without writing:
  - proposals: exactly one prescribing-list medicine by generic name;
  - ambiguous rows;
  - unmatched rows;
  - unreadable lines.

  Strength is never compared, because the prescribing list has none (Q6). A person confirms every link.

- **Not run:** no edition is in the repo. Counts need the EMHSLU file from the owner or the pharmacy in charge, as
  CSV with columns `generic_name, form, strength, level_of_care, ven_class, therapeutic_class`.

### Checks

| Check                                               | Result                                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `npm run typecheck` (app + Edge)                    | exit 0                                                                                            |
| ESLint over every changed path                      | 0 errors, 0 warnings                                                                              |
| `vitest run` (fixture Supabase URL, see STOP 0 11d) | 379 files; 9,061 passed, 3 expected fail, 1,318 skipped                                           |
| PGlite lane (`tests/emr-db`, `tests/ncdreg-db`)     | 56 files; 1,062 passed (204 of them new: `pharmacy-dispensing-data.test.ts`), 2 skipped           |
| Lab tests                                           | unchanged and passing (`lab-downtime`, `lab-cutover` and the rest of the lane)                    |
| Drizzle ↔ SQL parity                                | passes with the 39 new tables and the widened columns                                             |
| Step 0 baseline                                     | "a supply names a batch and moves stock" now passes and is a plain test; 3 still expected to fail |

**STOP 2.** For the owner:

1. Apply 0122 → 0130 when ready, in order (`npm run db:migrate`). Nothing reads them until the Phase 1 flags are
   on, and those stay off in production while the Phase 1 wording is draft.
2. Send the national list edition (CSV) when it is to hand.
3. Optional: run the Phase 0 backfill dry run against production.

---

## STOP 3 — Engines (12 Oct 2026)

Pure engines, no I/O; commits `ad6f4587` (wave 1) and `54e982d0` (wave 2), plus the shared write path in
`lib/pharmacy/write.ts`, `points.ts`, `actor.ts`.

| Engine                              | File(s)                                                                    | Tests |
| ----------------------------------- | -------------------------------------------------------------------------- | ----- |
| Lanes (LN)                          | `lib/pharmacy/lanes.ts`                                                    | 15    |
| Line stages and outcomes (LO)       | `lib/pharmacy/lines.ts` (the LO-4 table as data: `MOVES`)                  | 34    |
| Stock ledger (SL)                   | `lib/pharmacy/stock/ledger.ts`                                             | 24    |
| First expiry first out (SU-3)       | `lib/pharmacy/stock/fefo.ts`                                               | 9     |
| Catalogue (CT)                      | `lib/pharmacy/catalogue.ts`                                                | 10    |
| Availability (AV)                   | `lib/prescribing/pharmacy.ts` (`getAvailability`; the old seam unchanged)  | 23    |
| Review (RQ-1, RQ-9, RQ-12)          | `lib/pharmacy/review/review.ts`                                            | 15    |
| Queries (RQ-2 to RQ-11)             | `lib/pharmacy/review/queries.ts`                                           | 31    |
| Hand-over (SU-2 to SU-12)           | `lib/pharmacy/supply/handover.ts`                                          | 42    |
| Identity (SU-4, SU-5, H5)           | `lib/pharmacy/supply/identity.ts`                                          | 16    |
| Reversal and correction (SU-11, 14) | `lib/pharmacy/supply/reversal.ts`                                          | 13    |
| Controlled (CD)                     | `lib/pharmacy/controlled.ts`                                               | 22    |
| Downtime (DT), shared sheets        | `lib/pharmacy/downtime.ts`, `lib/downtime/sheets.ts` (the lab now uses it) | 29    |
| Labels and paper (LB, DL)           | `lib/pharmacy/print/{label,slip,register,dispensing-log}.ts`               | 22    |
| Patient list and messages (ML, MS)  | `lib/pharmacy/messages.ts`                                                 | 16    |
| Readiness and check state (RD, CK)  | `lib/pharmacy/readiness.ts`, `lib/pharmacy/check-state.ts`                 | 14    |

(Counts are `it` blocks; `it.each` tables expand further. The suite runs 792 tests over `tests/pharmacy`,
`tests/downtime` and `tests/lab`, plus 1 expected failure, the stock-answer seam that Step 9 closes.)

**Rule coverage:** 124 rule IDs in Section 6; 115 are named in a test today. The 9 not yet named belong to steps not
built:

- **Step 4 store:** SL-7, SL-8.
- **Step 8:** DT-6.
- **Step 9:** AV-8, ML-4, MS-3, MS-4, MS-5.
- **PA2-7:** proven by Phase 0's lane test of the 0098 trigger.

**The required proofs:**

- **LO-4:** exhaustive, 13 statuses × 31 moves against a separately typed copy of the table.
- **LO-5:** a 30-day clock leaves every fixture unchanged.
- **Property tests (seeded mulberry32, no new dependency):**
  - LO-9: 3 × 2,000 sequences;
  - SL-10: 60 seeds × 150 operations, every balance rebuilt from the ledger.
- **Concurrency:** PGlite, the deferred Law 3 triggers; and `tests/rls/pharmacy-races.test.ts`, owner-run with two
  connections.
- **FEFO:** first expiry, a split, an expired first batch, month-only February in 2027 and 2028.
- **Lanes:** every reason on and off, the no-rule case, and the proposal's P/W/N table row by row.
- **Availability:** every state, 11 co-holding pairs, and two no-quantity proofs (a type that cannot hold a number,
  and a deep walk over 20 shapes).
- **Byte equality:** screen, label and slip, with "500mg/5 mL", trailing spaces, "2,5 mg", tabs, a non-breaking
  space and a newline.
- **Banned-term scan:**
  - fixtures that must fail: a medicine name, a synonym, a clinic name, a point name, a product name, a patient
    name, an MS number, "500 mg", "2,5 mg";
  - every template passes.
- **Two-hospital fixtures** throughout. **Law 2:** Phase 0's test now checks that `lib/pharmacy` writes nothing
  outside pharmacy tables.

**Choices made while building, all stricter or recorded:**

1. **SL-9:** an expiry stock-out starts the day after `expiresOn`, because a batch is suppliable on its expiry date.
2. **AV-3 freshness:** applies only once a count exists. A received but uncounted medicine says "Received {when},
   not yet counted".
3. **Witness list (D-PH1-27):** with no signed witness list, nobody may witness (Law 8). The proposed list is the
   default to sign.
4. **Pharmacist co-signature (RD-1):** required on the clinical packs and the hazard log for any switch-on, the owner's
   condition for production.
5. **The slip needs the point's phone (W1).** No phone, no slip.
6. **`decision_cleared`:** moves nothing (LO-4 has no move for it); a decision is replaced by saving a new one.
7. **H1:** a `completed` line stays `cancelled_by_prescriber` ("not continued at visit close") whatever follows.
8. **Phone normalising:** reuses sign-up's `normalizeUgPhone`, landlines included, so a stored blind index always
   matches its own number.
9. **Message name:** the SMS templates leave about 28 characters for the hospital's message name before a message
   exceeds one SMS. The CSO should cap the message name there.
10. **New draft wording** (about 30 strings: refusal words, ready-check words, look-back reasons) is in
    `HANDOVER_COPY`, `READY_COPY` and `DOWNTIME_DRAFT_COPY`, marked draft, for signature with the Phase 1 copy.

**Phase 0 tests changed, with reason:**

- **The nav registry test:** with flags off it still asserts Phase 0's two items, and it adds the Phase 1 order.
- **The Law 2 scan:** recursive, and narrowed to the law itself.

No lab test changed.

**STOP 3.** No owner action. Step 4 is in progress.

---

## STOP 4 — Stock at the dispensing point (12 Oct 2026)

Commit `d96c620e`, behind `pharmacyDispensing`. Routes `/pharmacy/stock` and `/pharmacy/stock/{medicineId}` (the
detail is its own page, W10); both are not found with the flag off. The acting-point chooser is in the top bar
(D-PH1-45). With the flag off, the layout reads no point and no cookie.

| Scenario | Result (PGlite lane, `tests/emr-db/pharmacy-stock.test.ts`)                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1       | A receipt makes the balance the quantity, with one ledger row; a retry with the same key writes nothing more                                                  |
| S2       | A matching blind count records "matched"; a differing one is saved, then shows both figures; with the reason, one correction is written                       |
| S3       | No reason, or "Other" without text: refused. With a reason the balance moves; below zero is refused in words                                                  |
| S4       | An expired batch shows "Expired, remove", is not offered by first expiry first out, and counts as nothing on the shelf                                        |
| S5       | A transfer writes both movements. With a failure injected between them, neither exists. A transfer for a request closes it                                    |
| S6       | The same batch number with another expiry is refused, showing both. A month and its last day are the same expiry                                              |
| S7       | "No product" shown; a technician adds one. No reorder level means never Low. A controlled product is refused: "Controlled drugs are set up in the next step." |
| S8       | A batch found on the shelf needs a reason and can then be chosen; a new product is marked "Added at the window"                                               |
| S9       | A view-only actor is refused on all 11 writes and still reads the page                                                                                        |
| S10      | Another hospital's pharmacist reads nothing (seven tables probed) and writes nothing                                                                          |
| S11      | Only the in-charge corrects a batch; the old expiry and the first expiry are kept; no movement changes                                                        |

**Choices:**

- **The blind count saves in two steps.** The typed figures are saved with the recorded balance first. The reason
  for a difference comes second, and only then is the correction movement written, with the reason on it. Asking
  for the reason first would reveal that a difference exists.
- **Retries:** every stock write uses the action's client key as the new row's id, so a retry finds the row it
  already wrote.
- **"Counted this week"** means the last 7 days.

**Not built as dialogs** (the actions exist): a request to another point, setting a price, setting count freshness.

**Phase 0 test changed:** the server-action file check in `tests/pharmacy/ui.test.ts` now admits
`app/pharmacy/stock/actions.ts` and checks that its writes go through `runPharmacyWrite`.

**Screenshots:** with the rest, at the end of Step 9 (the harness rebuilds its database from every migration on
start).

---

## STOP 5 — Review, queries and outcomes (12 Oct 2026)

Commits `2cf1921d` (both sides) and `e3316571` (the change link made atomic), plus migration 0131 (`e1008eb6`,
payment status). Behind `pharmacyDispensing` and a live point. With the flag off, `/pharmacy` and every doctor
screen are the baseline (Phase 0's queue tests pass).

**The pharmacy side:**

- the review queue: signed lanes, LN-4 with no rule, stages, the earlier-still-open group;
- the review screen: acceptance, decisions, the overridden-stop block, changed lines struck through;
- queries, with recipients resolved and a delivery step that never throws;
- phone answers and disputes;
- not on the shelf, and the A5 slip with its verification code (Find opens it, this hospital only);
- Open lines, close as not collected, bring into the queue, payment status.

**The prescriber side:**

- the chip and the "{n} from the pharmacy" count on the plan step;
- the query, with keep, change and stop;
- the not-supplied notice;
- `cancelPrescriptionLine` (D-PH1-41);
- the print record on the doctor's prescription print (D-PH1-49; the paper is byte-identical, hash-checked);
- the `user:<id>` nudge through the listener the doctor layout already mounts, with polling when unsubscribed.

| Scenario | Result (PGlite lane)                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| S12      | No signed rule: every prescription pharmacist-first. With a rule: plain → standard; stop, controlled, changed pre-set → pharmacist-first          |
| S13      | A technician's forged accept refused; a forged not-supplied and a decision refused "Waiting for a pharmacist"                                     |
| S14      | `accepted_overridden_stop` written; "Accept the remaining lines" takes only unflagged lines                                                       |
| S15      | `notified` written for the prescriber; the message lands on `user:<doctor>`; the other two lines stay decidable. Timing in the harness at the end |
| S16–S18  | Keep returns the line to review with the answer; change replaces it; stop cancels it                                                              |
| S19      | Changing one line leaves a whole-prescription query open; "Changes made" closes it                                                                |
| S20      | Delivery forced to fail: the query stands; "The prescriber has NOT been told…"; nothing threw                                                     |
| S21      | Nobody to tell: not sent, "Nobody can be told…", answered by a logged phone keep; withdrawn → to review → owed                                    |
| S22      | Phone keep answers via phone naming both people; "will change it" answers nothing; the named clinician's dispute reopens it                       |
| S23      | A second clinician answers; a third attempt is shown the first and writes nothing; a nurse is refused                                             |
| S24      | Owed listed under Open lines; no supply exists                                                                                                    |
| S25      | The slip prints with a valid code that resolves for this hospital only; a controlled line is never offered buying outside                         |
| S26      | Owed ⇄ buying outside, with the slip                                                                                                              |
| S27      | Returned to the prescriber; an alternative chosen (old line replaced) or left as it is                                                            |
| S28      | Awaiting co-sign: queried, no decision; after co-sign, to review                                                                                  |
| S29      | Decline refused before a query; allowed after a keep; while open it closes the query                                                              |
| S30      | 30 days later still listed; close as not collected                                                                                                |
| S31      | Confirmed filled elsewhere, naming who said so                                                                                                    |
| S32      | Before go-live: out of scope; brought into the queue                                                                                              |
| S33      | Inpatient supply off: ward lines review-only; a standard ward prescription never appears                                                          |
| S34      | Nurse, receptionist, another hospital's pharmacist refused at all 16 actions; nothing written                                                     |

**Decided while building:**

1. **Payment status** is its own append-only table (0131); the latest per prescription is in force. "Exempt" is
   refused until a signed exemption list exists.
2. **"Change" is atomic** (HZ-PH1-45): the replacement travels with the prescription into `placePlan`, which
   cancels the old line naming the new one before commit. If the link is refused, nothing is placed.
3. **Not-supplied acknowledgements** get their own table (0132, in progress), so "Leave it as it is" always records.
4. **Prescriber writes live in `lib/emr/write/pharmacy-answers.ts`.** `lib/pharmacy` stays free of any write to
   prescriptions, and its Law 2 test still holds.

**Not built yet:**

- the doctor-workspace lane badge (`FlowTask`);
- "Send for it from another point" (it records owed and links to Stock; the request itself is made from Stock);
- Find a prescription still searches the last 30 days.

**Drafted wording:** query types, keep reasons, stop reasons and outcome reasons are drafted lists, acting only
outside production until signed.

---

## STOP 6 — Hand-over and supply (12 Oct 2026; the first merge)

Commit `9e86e10a`. Behind `pharmacyDispensing` and a live point.

**What it does:**

- **`recordHandover` is one transaction.** It locks every line (sorted) and the batches, re-checks, writes exactly
  the engine's rows, and stamps the payment status.
- **Identity:** the second identifier is typed and compared on the server, by blind index with a decrypt fallback,
  and is never shown. Five wrong tries per patient per day close it; the in-charge reopens it.
- **Labels:** one per batch, directions byte for byte, by hand where the point says so.
- **Supplied today,** with the look-back tab.
- **Reversal** on the same day, fit or written off.
- **"Recorded in error"** later.
- **Supply now** from Open lines.
- **Ward-staff collectors** with inpatient supply on.

| Scenario | Result (PGlite lane, `tests/emr-db/pharmacy-supply.test.ts`)                                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S35      | One hand-over, 3 supplies, 3 movements; each batch down by exactly its quantity; each supply names batch and expiry. 39 ms warm (PGlite in-process; production timing in the final report)                 |
| S36      | Name alone refused; five wrong dates of birth logged as outcomes only, the fifth closes the check; another way passes and is listed and counted; the in-charge reopens; no response carries a stored value |
| S37      | A representative's name and relationship stored                                                                                                                                                            |
| S38      | Split across two batches in expiry order: two supplies, two movements, two labels                                                                                                                          |
| S39      | A batch other than first to expire needs a reason, at the decision and at hand-over                                                                                                                        |
| S40–S41  | Part supply, the rest owed or bought outside; a later Supply now of part keeps it open; more than owed refused                                                                                             |
| S42      | "Batch FX-… now holds 7. Choose again." Nothing written                                                                                                                                                    |
| S43      | The second point refused: "…was already supplied at Fixture point A, HH:MM." (concurrent version: the owner-run race test)                                                                                 |
| S44      | "Changed by the prescriber at … Review it again." Nothing written                                                                                                                                          |
| S45–S46  | A double tap writes one hand-over; awaiting co-sign refused                                                                                                                                                |
| S47      | One label per batch, directions byte for byte; by hand: the tick, nothing printed                                                                                                                          |
| S48      | A technician supplies another pack of the same strength; a different strength is refused for everyone until a strength mapping is signed (W4)                                                              |
| S49–S50  | Nothing pre-filled; payment status required → "not recorded" refused, Emergency passes                                                                                                                     |
| S51–S52  | Reversal fit / written off, the line back where it was, the prescriber told; next day not offered. "Recorded in error" moves no stock                                                                      |
| S53–S55  | Supplied today count equals the day's hand-overs; D-PH1-05 off/on by fixture, controlled still refused; ward staff collector                                                                               |
| S56      | No fixed widths; checked in the harness at the end                                                                                                                                                         |

**Not built as specified:**

- "Identified another way" is part of `recordHandover`, not a separate action.
- Supply now uses first-expiry batches without the Change dialog.
- Look-back offers "Looked at" only, not "Send a query".
- The ward name is shown but not stored.
- A label reprint needs a live point.

**ADRs:** 0260 to 0279 are now all written.

**First merge:** Steps 0 to 6 are complete on the branch. The owner can review and merge whenever they choose;
nothing reaches production behaviour while the flags are off.

---

## STOP 7 — Controlled drugs (12 Oct 2026)

Commit `6dfe8f46`.

- **The witness:** proves who they are with their own password and authenticator code on a throwaway client
  (`lib/auth/attest.ts`, D-PH1-42). Five failures lock that witness for an hour.
- **The count:** committed before MedSync's figure is shown. A difference is recorded with both people and
  corrected by a witnessed movement.
- **The supply:** the controlled supply records the whole hand-over in one transaction, with both paper
  attestations and the witness's agreement.
- **The stock side:** witnessed receipts, counts and transfers.
- **The paper:** the Controlled drugs page, and the register slip headed "This is not the register."
- **Tests:** S57–S66 pass on the PGlite lane, with the verifier injected.

## STOP 8 — Downtime, the dispensing log and going live (12 Oct 2026; the second merge)

Commits `c5758ab7` and `6dfe8f46`.

- **Sheets:** reserved and printed (DS-numbers, A4).
- **Back-entry:** keeps the sheet's time, refuses only what DT-4 lists, and flags the rest for look-back.
- **Paper prescriptions:** their own record.
- **The daily dispensing log:** one row per batch, in the hospital's confirmed column order.
- **Going live:** the page has six conditions and needs two admins. A second point needs a pilot note by someone
  else.
- **Switching off:** needs a reason and a second admin.
- **Tests:** S67–S83 pass.

## STOP 9 — Beyond the floor, hardening and documents (12 Oct 2026; the third merge)

Commits `d7457597`, `3920e97b`, `68459bf8` and `74127538`.

- **The prescriber's stock line:** in words, no quantity, never a Stop. Every answer shown is stored.
- **The nurse's chip.**
- **The patient's medicine list:** from supplies, with refill dates only from recorded days or a course supplied
  in full.
- **The patient's taps.**
- **Messages:** go through one guarded path and never name a medicine.
- **The screenshot fixes:** the nav permissions, phone layouts, counts, the go-live wording, the opening count.
- **Guards:** HZ-48 and HZ-57.
- **Documents:** the user guide, the completed hazard log, the final report.
- **Tests:** S84–S96 pass.

**Final numbers and what remains: [FINAL-REPORT.md](FINAL-REPORT.md).**

---

### Owner's answers after STOP 9 (13 Oct 2026)

- **Owner SQL A–D:** run on production on 13 Oct 2026. `public.prescriptions` holds **0 rows** (no first or last
  `created_at`), and SQL D returned 0 patients and 0 phones without a blind index. A to C therefore have nothing to
  count. Q7's lane counts are **deferred**: the lane-reasons pack is to be re-checked against real prescriptions
  once the first hospital prescribes in production, before any point goes live. D-PH1-04 stands as approved.
- **The pharmacist's co-signature (RD-1, owner's STOP 1 condition): replaced for now.** Until MedSync has a
  pharmacist reviewer, the CSO (a superadmin) signs the clinical packs, the hazard log and the patient wording
  alone, and each signed set records that as its exception in words (0122). The check stays in the code and is
  switched off (`PHARMACIST_COSIGN.required`, `content/pharmacy-golive.ts`). It is to be reimplemented later. The
  hazard log now needs the CSO's own signature (`HAZARD_LOG_SIGNATURE.csoSignedBy`) for condition 1 to be met.
- **Phase 1 wording:** the sign-off portal is at https://claude.ai/artifact/TqufiL5JPsi4ERGhk32yM4, with 1,134
  strings in 116 blocks plus the message name per hospital. Signatures are written into the code when the owner
  says they are done.
- **Phase 1 wording signed (13 Oct 2026):** the CSO signed all 116 blocks (1,134 strings) as written, with no
  change asked, at 07:26 UTC. Each signed text was compared with the code before applying: 1,134 of 1,134 equal.
  `PHARMACY_PHASE1_COPY_STATUS` and every copy object now carry `signed` (Fadhul (CSO), 2026-10-13). In production
  the four flags can now be switched on per hospital. Patient surfaces still need a signed message name and
  approved templates (RD-4), and no point dispenses until the go-live switch's six conditions are met. No message
  name was signed in the portal, and the hazard log is not yet signed.
- **The national list (13 Oct 2026):** the owner supplied EMHSLU 2023 as a PDF. It was converted to
  `data/pharmacy/national-list/emhslu-2023.csv`: 802 medicines and 1,919 supplies, with 26 rows flagged, each
  logged with its page. The dry run read all 802 medicine rows: 265 propose one of 124 prescribing-list medicines,
  0 are ambiguous and 537 are unmatched. Step 4 had built only the dry run. The owner chose "catalogue first",
  "the CSO confirms links once, nationally" and "load the uncertain rows as printed, flagged". ADR 0282 and
  migration 0136 add the loader, the CSO's console (`/admin/pharmacy-catalogue`) and the Stock search
  (`/pharmacy/stock/national-list`).
