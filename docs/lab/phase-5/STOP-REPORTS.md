# Lab Phase 5: STOP reports

## STOP 0: Discovery and baseline (17 Oct 2026)

Branch `feat/lab-beyond-lis`, cut from `origin/main` at `d28abf5d` (Phase 4 merged, PR #238). The prompt and the
research notes are copied here.

### Q1 Phases 1–4 merged: **yes**

| Used by this slice                         | Where                                                                                                                                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Acknowledgement, per version               | `result_acknowledgements` (`db/schema/emr.ts:1156`; 0071:961, append-only); `acknowledgeResults` (`lib/emr/write/results.ts:1034`); `ackState` (`lib/emr/results.ts:333`)                      |
| Criticals                                  | `critical_alerts`, `critical_marks`, `critical_alert_events` (`db/schema/lab-safety.ts:73–117`); `acknowledgeAlert` writes an "acted" acknowledgement (`lib/lab/criticals/store.ts:716–801`)   |
| Amendments, correction alerts              | `amendResults` (`lib/emr/write/results.ts:873`); `correctAlerts` (`criticals/store.ts:1135`)                                                                                                   |
| Restricted classes                         | `test_catalogue.restricted_class` ∈ hiv, tb, mental_health, sexual_reproductive_health (0107:116); pregnancy (`test.pregnancy_urine`) is mapped to `sexual_reproductive_health` (0107:121–126) |
| Snapshots, flags                           | `lab_result_snapshots` (`lab-safety.ts:183`), `resolveRange` (`lib/lab/ranges.ts:92`), `lib/lab/flags.ts`                                                                                      |
| Decision schemes, method register, bedside | `lib/lab/interpretation.ts`; `method_code` on measures and bands; `recordBedsideResult` (`lib/lab/bedside-store.ts:82`)                                                                        |
| QC status and hold                         | `qcStatusFor` (`lib/lab/qc.ts:86`); `qcGate` (`results.ts:209`); `diagnostic_reports.qc_held`                                                                                                  |
| Nonconformities                            | `NcSource` (`lib/lab/nonconformity.ts:12`)                                                                                                                                                     |
| Referred results, outbreak referrals       | Phase 4: `lab_referrals` (`routine = false` is RF-7), provenance on the report                                                                                                                 |

### Prompt against repo: the differences

| #   | The prompt says                                      | The repo has                                                                                                                                                                                                      | Proposed                                                                                                             |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | `hold_from_patient` seam from Phase 1 (H22)          | **Absent** from code and schema; only in the Phase 1 prompt                                                                                                                                                       | Built new: `patient_holds` + events                                                                                  |
| 2   | Phase 1 "Mark reviewed"                              | No "Mark reviewed" for results; review = `result_acknowledgements` (actions seen, acted, forwarded) on the **current** version                                                                                    | PR-2 reviewed = a `seen` or `acted` acknowledgement of the current version by a clinician; `forwarded` is not review |
| 3   | Account-to-record link (PR-10, H23)                  | The patient account **is** the record: every clinical row keys on `patient_user_id` = the patient's auth user. Walk-in bookings reconcile through `provisional_patients` (desk-verified, `ha-reconcile-identity`) | PR-10 holds by construction; two identifiers = name and `patient_code`                                               |
| 4   | Patient app assurance                                | Patients are **AAL1** (`lib/auth.ts:11–19`); MFA optional                                                                                                                                                         | Results need a fresh sign-in after the idle limit (operational); AAL2 not demanded of patients                       |
| 5   | Guardian links                                       | `booking_agents` refuses minors (`declared_adult` must be true); no guardian-of-child link                                                                                                                        | New `guardian_links`; nothing shown to under-18s until the minors rule is signed (PR-11)                             |
| 6   | Method groups (DL-2)                                 | No method group; `method_code` on the measure                                                                                                                                                                     | Compare only when the two results' `method_code` match or the rule says so                                           |
| 7   | Transfusion, dialysis, surgery (DL-5)                | None recorded; a generic `procedures` table only                                                                                                                                                                  | DL-5 lists `procedures` rows between the two results; transfusion waits for blood bank                               |
| 8   | Mislabel / WBIT nonconformity (Q13, DL-7)            | No such NC code; only the rejection reason `unlabelled_or_mislabelled`                                                                                                                                            | NC source `delta` added; mislabel is its code                                                                        |
| 9   | Interfaced results and analyser flags (AV-2)         | **No analyser interface path** (Phase 4 Step 10 was a gap); `lab_result_snapshots.interfaced` never written                                                                                                       | Step 9 is a gap report                                                                                               |
| 10  | Microbiology isolates (MB-1)                         | No microbiology module                                                                                                                                                                                            | Step 10 is a gap report                                                                                              |
| 11  | IPC roles (`ipc.alerts`, `ipc.manage`, `surv.focal`) | Only the `ipc_lead` designation (0150); no surveillance focal person role; ward in-charge via `ward_in_charge_assignments` (0031)                                                                                 | Designations widened: `ipc_link_nurse`, `surveillance_focal_person`; `ipc.manage` = `ipc_lead`                       |
| 12  | Alert triggers on the menu (Q15)                     | Xpert MTB/RIF (`test.tb_xpert`, coded, five answers) only; **no** cholera, measles, _C. difficile_, influenza or SARS-CoV-2 tests                                                                                 | Those list entries read "Test not on this menu"; the outbreak referral trigger (RF-7) works today                    |
| 13  | Calcium for the EDTA pattern                         | `obs.calcium` exists; no test includes it                                                                                                                                                                         | Pattern rules wait for a test that carries the components                                                            |
| 14  | Playwright (Q18)                                     | **Not installed**; axe-core installed                                                                                                                                                                             | **Flagged**: the Phase 4 screen harness (headless Chrome over CDP, axe injected) stands in, as at Phase 3 and 4      |
| 15  | H17 weekly list                                      | The guideline's weekly form is **HMIS 033b**, 21 rows incl. "Rifampicin resistant TB cases (DR)"                                                                                                                  | See `idsr-transcription.md`                                                                                          |

### Q2 H1–H24

| #       | Verdict                                                                                                                                                                                                  |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1–H10  | Carried from the research notes (17 Oct 2026, with confidence marks); legal sections to be confirmed by counsel (Q7)                                                                                     |
| H11–H15 | Carried; no numeric delta or autoverification value is used anywhere                                                                                                                                     |
| H16     | Carried; Chapters 5–6 of the 2025 IPC Guidelines **not obtainable** publicly (only the 2013 edition found); the IPC lead supplies them (Q17)                                                             |
| H17     | **Corrected**: Table 2 transcribed (32 entries); the weekly form is HMIS 033b; see `idsr-transcription.md`                                                                                               |
| H18–H21 | Carried (Step 10 and the flag design)                                                                                                                                                                    |
| H22     | **Corrected**: the seam does not exist                                                                                                                                                                   |
| H23     | **Confirmed with a correction**: the web app exists (`app/patient/**`, Emergency pill in the root layout, next-themes dark mode, an offline-shell-only service worker); the "link" is the account itself |
| H24     | **Confirmed**: `lib/notifications/africastalking.ts`; inbound STOP at `app/api/sms/inbound/[secret]`; delivery receipts at `app/api/sms/dlr/[secret]`; `sms_opt_outs` (0062)                             |

### Q3 The patient web app

Routes under `app/patient/`: home, appointments, book, care (visit summaries), clinician, consent, hospitals,
household, menu, profile, queue, settings, symptoms, track. Auth: `proxy.ts` requires a session; `requirePatientScope`
adds the data-processing consent gate. PHI shown today: visit summaries (diagnoses, medicines, **test names**),
prescriptions, self-tracking, intakes, profile. **No laboratory result is shown on any patient surface.**
Storage: a booking draft in `localStorage` and symptom picks in `sessionStorage` (no results). Steps 6–8 can
proceed.

### Q4 Account-to-record link

See difference 3. Linked accounts at the test hospital: a production read, not made by Claude (owner).

### Q5 Review today

See differences 1 and 2. Criticals are acknowledged "first wins" and also write an acknowledgement. No "told the
patient" concept exists outside pharmacy.

### Q6, Q11 SMS

Africa's Talking (`AFRICASTALKING_USERNAME`, `_API_KEY`, `_SENDER_ID`; `SMS_WEBHOOK_SECRET`), STOP keywords
(`lib/channels/sms-keywords.ts`), `sms_communication` consent (`lib/notifications/consent.ts`), dispatches with
delivery state. **One sender ID** for the deployment, not one per hospital: PS-4 needs a per-hospital neutral
sender ID or the shared one must be neutral (owner: registration, cost, government or private status).

### Q7–Q10 Legal and policy (owner actions)

- **Q7 legal opinion**: to be requested by the owner from the hospital's counsel (children and adolescents; the
  basis for app and SMS; holds against s.24). **Request date: not yet recorded.** Blocks Steps 6–8 going live, not
  their build.
- **Q8**: no privacy notice, terms or PDPO registration is published in the app. Patient access stays closed in
  production.
- **Q9, Q10**: DPPA Regulations 2021 and the HTS, TB and maternal guidance: not obtained; owner.

### Q12–Q14 Data (production reads, owner)

Pairs per concept, interval distributions, mislabel nonconformities and the share of results with current QC are
production reads; Claude does not read production. Q14: no analyser is live on a bridge.

### Q15–Q17 IPC

IPC lead designation exists (Phase 4); link nurses and the surveillance focal person are to be named. Admissions
give ward (`admissions`, 0091) and bed (`bed_assignments`, 0090). Q16: Table 2 and HMIS 033b transcribed
(`idsr-transcription.md`); **the surveillance focal person must check it before signing**. Q17: chapters not
obtained.

### Q18 Test tooling

Playwright missing (flagged; harness stands in), axe-core present, fake timers via `vi.useFakeTimers`.

### Baseline

`tests/lab/phase-5/baseline.test.ts`: (a) delta and (b) IPC as `it.fails` (expected fail), (c) the patient-surface
guard passes (no patient surface reads a result). Screenshots of the patient app, doctor's results and result entry
are taken with the harness at Step 11 (the Phase 4 harness shots stand for the lab screens today).

## STOP 1: GATE A (17 Oct 2026)

`gate-a-proposal.md` and `hazard-log.md`. The owner instructed "use your recommendations": D-LAB5-01–26,
E-LAB5-01–03 and A1–A19 are recorded as signed as recommended. Data that needs a named signer (release table, plain
words, the minors rule, the SMS template, delta rules, the alert list) is signed later in the product. Patient access
stays closed in production until the legal opinion (Q7) and the privacy notice, terms and PDPO registration (Q8).

## STOP 2: Data layer (17 Oct 2026)

Migrations **0154** (patient results), **0155** (delta checks), **0156** (IPC feed), **0157** (lab demo), all GATED
and unapplied; Drizzle in `db/schema/lab-phase5.ts` (+ `test_catalogue.patient_group`), parity green (313).

| Proof                                                                                                                                                                                             | Where                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| The never-shown floor in the database: HIV, TB, pregnancy, tissue, signed additions; FBC is not                                                                                                   | `tests/emr-db/lab-phase5-data.test.ts`   |
| The patient's read (`patient_results_for_me()`): only released, current, adult, consented, reviewed, told-when-critical, unheld results of their own; never the floor; never a child; anon denied | same                                     |
| No client INSERT, UPDATE or DELETE on any of the 15 new tables (lab reader, patient, anon)                                                                                                        | same                                     |
| Append-only triggers on the 10 append-only tables                                                                                                                                                 | same                                     |
| IPC alerts: link nurse all, in-charge their ward, focal person routed only; clinician, lab, another hospital none; IC-3 uniqueness                                                                | same                                     |
| Demo rows only at a hospital marked demo; demo patients labelled "Demo …"                                                                                                                         | same                                     |
| No regression                                                                                                                                                                                     | every PGlite lane: 74 files, 1,319 tests |

Found and fixed: `patient_results_for_me()` was callable by `anon` through Supabase's default function privileges;
revoked explicitly.

## STOP 3: Engines (17 Oct 2026)

| Module                        | Rules                                                                                                                                               | Tests                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `lib/lab/patient-release.ts`  | PR-1 (decision table), PR-3 (floor + property test over 1,152 combinations), PR-4, PR-5, PR-6, PR-7, PR-8, PR-9 (edges), PR-11, PR-12, PR-16, PR-17 | 18                             |
| `lib/notify/results-ready.ts` | PS-1, PS-2, PS-3 (hours across midnight, batching), PS-4                                                                                            | 5 (in `results-ready.test.ts`) |
| `lib/lab/plain-words.ts`      | PW-1, PW-2, PW-3 (lint), PW-4, PW-5, PW-6                                                                                                           | 3                              |
| `lib/lab/delta.ts`            | DL-1, DL-2, DL-3 (every type, rise/fall, RCV at both Z conventions and log-normal), DL-6, DL-8, DL-9, DL-10, DL-11                                  | 13                             |
| `lib/ipc/lab-alerts.ts`       | IC-1, IC-2 (result, referral, amendment, off-menu), IC-3, IC-6, IC-7, IC-8, IC-10, IDSR-only                                                        | 10                             |

Signed kinds registered (`lib/lab/signed-config.ts`); the IPC alert list is signed by the IPC lead and countersigned
by a laboratory lead (new slot `lab_counter`); the results consent notice by the data protection lead alone. Rules
covered in later steps by the lanes: PR-2, PR-10, PR-13, PR-14, PR-15 (Step 6–7), PS-5, PS-6 (Step 8), DL-4, DL-5,
DL-7, DL-12, DL-13 (Step 4), IC-4, IC-5, IC-9, IC-11–IC-14 (Step 5). AV-_ and MB-_ are gap reports.

## STOP 4: Delta checks (17 Oct 2026)

Built behind `LAB_DELTA_CHECKS`:

- **Evaluation** in the shared result writer (`writeReportVersion`) on every laboratory version that has unit
  snapshots: signed delta, panel and pattern rules in force at the time of writing, against the patient's released
  results in the same unit (`lib/lab/delta-store.ts`). A flag keeps both values, the rule version, the change and the
  interval; a release that carries the same value keeps the earlier decision.
- **Release gate (DL-6)**: an in-house lab release refuses while any live flag has no decision; the result-entry page
  shows the flags (`delta-panel.tsx`, amber, `role="alert"` once) and Release stays disabled with the reason. Referred
  and bedside results are flagged but not held here (A20, recorded below).
- **Decisions (DL-6, DL-7)**: a structured outcome with a required note; "recollect" rejects the specimen with the new
  reason "possible wrong sample (delta check)"; "mislabel confirmed" opens a nonconformity from the new source `delta`.
- **Rules page** `/lab/setup/delta` (§5.7): rules with status, last-30-day flags and "Flags often · review"; forms for
  delta (with a live RCV calculator, symmetric or log-normal), panel and pattern rules; "Try it on past results"
  (reads only); signing in the lead slot, countersigning in the CSO console.

| Scenario | Result | Evidence (`tests/emr-db/lab-delta.test.ts`)                                                                                          |
| -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| S1       | Pass   | MCV change fires DC-MCV-1 with both values; release refused until a decision; "with whom" required                                   |
| S2       | Pass   | Recollect rejects the specimen as `possible_wrong_sample`                                                                            |
| S3       | Pass   | Mislabel confirmed opens an NC from `delta`                                                                                          |
| S4       | Pass   | A procedure between the results is listed; the rule still fires                                                                      |
| S5       | Pass   | RCV from the signed CVA and CVI: 5 % does not fire, 9.5 % does (CVA and CVI are in the signed payload, so a change is a new version) |
| S6       | Pass   | A previous result by another method code is not compared                                                                             |
| S7, S8   | Pass   | Panel rule fires once; pattern rule informs with its meaning                                                                         |
| S9       | Pass   | A draft rule never runs                                                                                                              |
| S10      | Pass   | Trial reads pairs and writes nothing; review shows outcome shares                                                                    |

Baseline (a) flipped to a plain `it` (fixed).

**A20 (recorded):** DL-12 asks for referred and interfaced results to be evaluated; they are, but the release gate
holds only in-house lab releases, because the referred result form (Phase 4) has no decision step yet. Their flags
show on the order. **Gaps:** the "Last time" column of artboard 6 is the panel's Previous line; the rules page cannot
tell the author of a draft, so the exception note is not offered (the server still refuses the author).

## STOP 5: The infection prevention feed (17 Oct 2026)

Built behind `IPC_LAB_FEED`, without microbiology:

- **Raised in the same transaction** as the release (`raiseIpcAlerts` in the shared result writer) or the outbreak
  referral (`raiseForOutbreakReferral` in `recordOutbreakReferral`), from the signed alert list; one alert per
  patient per condition per episode (the open admission, else the visit); a later result attaches; an amendment that
  removes the answer closes it with "Result corrected".
- **Readmission and moves (IC-9)** by trigger on `admissions` and `bed_assignments` (0156), because admissions are
  written in SQL; the first bed of an admission is not a move.
- **Workspace `/ipc`** (A13): Lab alerts (Open · Closed this week · Flagged patients; the minimum dataset in a centred
  dialog; actions; flag clearing with a reason), Alert list (IPC lead signs, a laboratory lead countersigns, the
  surveillance focal person checks the IDSR route; "Test not on this menu"; microbiology entries "Waiting for the
  microbiology module"), Surveillance (this week's tiles, IDSR counts by item, the Monday deadline, "Needs
  microbiology", print the digest). Scope by designation, ward in-charge (their ward) or laboratory lead (the list).
- **Escalation (IC-7)** on the every-minute lab escalation tick; **the flag (IC-8)** on the bed board for every
  viewer who sees the patient.

| Scenario | Result | Evidence (`tests/emr-db/lab-ipc.test.ts`)                                                                                                                             |
| -------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S11      | Pass   | RR-TB raises one alert in the release's transaction with the weekly route and the `tb` mark; the table has no value column                                            |
| S12      | Pass   | Replay: an unlisted answer raises nothing, a listed one exactly one                                                                                                   |
| S13      | Pass   | With no clinical basis of their own, the IPC nurse reads the alert, not the TB report; a view is recorded                                                             |
| S14      | Pass   | No action within the window escalates once                                                                                                                            |
| S15, S16 | Pass   | Precautions started (type and place required) set the flag; admission of the flagged patient raises a readmission alert; only IPC clears, with a reason; history kept |
| S17      | Pass   | A screening entry labels its alert "Screening result: confirm"                                                                                                        |
| S18      | Pass   | An outbreak referral raises the VHF alert at referral, notify-now route                                                                                               |
| S19      | Pass   | An amendment that removes the answer records "Result corrected"                                                                                                       |
| S20      | Pass   | IDSR counts for the epi-week equal the hand count                                                                                                                     |

Baseline (b) flipped (fixed). **Gaps:** "live" is a page refresh, not a broadcast (A21: the realtime channel for
IPC needs its own authorisation); the optional SMS to the on-duty link nurse is not sent (no roster); the flag shows on
the bed board only, not yet on registration and triage screens; Q15–Q17 (named people, the 2025 guideline chapters)
remain owner actions.
