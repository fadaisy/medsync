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
