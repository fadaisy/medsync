# Lab Phase 1 — GATE A proposal

**Status:** decisions signed 11 Oct 2026 by the owner's instruction (§12). **Not signed, and not signable by
instruction:** every clinical number (critical limits, response times, reference ranges), the Appendix A wording and the
hazard log. They ship `draft`; production refuses every flag that depends on them until the CSO signs them explicitly.

Prompt: [PROMPT-LAB-PHASE-1.md](PROMPT-LAB-PHASE-1.md). Evidence: [STOP-REPORTS.md](STOP-REPORTS.md), STOP 0.
**For:** Fadhul (owner, CSO), the laboratory lead who will co-sign ranges and limits, and the sessions that build Steps 2–8.

---

## 1. What Step 0 changed

| Finding                                         | Answer here                                                                                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| No scheduler can run every minute               | `pg_cron` + `pg_net` call `/api/cron/lab-escalations` every minute (owner, 11 Oct); lazy escalation on every alert read; a heartbeat (§6) |
| Playwright absent                               | The scratch harness (D-LAB0-19, owner, 11 Oct)                                                                                            |
| Lab staff lost access at midnight               | Fixed first: migration 0101, ADR 0238, applied 11 Oct                                                                                     |
| Units converted today (D-CFC-14)                | Fixed units, no conversion, **behind `labUnitsRanges`**; off, D-CFC-14 stays (owner, 11 Oct; D-LAB1-26)                                   |
| No signed-reference store per hospital          | Dedicated tables shaped like `capability_values`: two different signers, a CHECK in the database (E-LAB1-02)                              |
| No per-user realtime channel; no in-app surface | A private `user:<id>` topic carrying `{alertId, kind, at}`; the alert itself is the in-app surface                                        |
| SMS: provider and NCD template pattern only     | `lab_sms_templates` on the NCD pattern (draft → two approvers); the logging transport; live off by default                                |
| No lab phone number                             | `lab_settings.lab_phone`, per hospital; "Call the lab" is absent until it is set                                                          |
| `critical_results` lane already exists          | Its source gains open alerts for the viewer; it keeps its place after Resus                                                               |
| Reports carry `restricted`, not classes         | Law 12 is enforced on `restricted` (§7); per-class filtering waits for reports to carry classes (hazard 16)                               |

---

## 2. Screens (wireframes; canvas artboards 1–14 are the look, this is the content)

### 2.1 Result entry, units and ranges on (artboard 1)

```
 Back to the worklist
 ⚠ Automatic critical flagging is off. MedSync will not flag … mark critical results by hand.     (amber, role=status)
 Enter results — Urea and electrolytes · Patient Seven-7 · MS-2026-00007 · F · 58 y · Urgent
 ┌ Analyte ─────┬ Result ──┬ Unit ──────────┬ Reference range ─────────┬ Flag ───────┬──────────────┐
 │ Sodium       │ [ 138  ] │ mmol/L 🔒      │ 135 – 145  (signed)      │ In range    │ ⋯ Mark crit. │
 │ Potassium    │ [ 7,2  ] │ mmol/L 🔒      │ 3.5 – 5.1                │ ▲ High      │ [Mark critical]
 │ Creatinine   │ [      ] │ —              │ This test has no unit yet, so it cannot be resulted. Ask the lab… │
 │ Urea         │ [ 24.6 ] │ mmol/L 🔒      │ No range for this age    │ —           │              │
 └──────────────┴──────────┴────────────────┴──────────────────────────┴─────────────┴──────────────┘
 [Save as preliminary]  [Release final]
```

Values are examples. "7,2" is read as 7.2; "7.25" on a one-decimal test is refused with "Potassium takes 1 decimal
place". The unit carries a lock and is part of the field's name ("Potassium, millimoles per litre").

### 2.2 Mark as critical (artboard 2)

The right column becomes a region with a heading; the results stay visible and read-only.

```
 MARK AS CRITICAL                                   ← focus lands here; Esc returns to the row
 Potassium 7.2 mmol/L  ▲ high                        (large)
 Urea and electrolytes · range 3.5 – 5.1
 Check before release (one):  ○ Repeated on the same sample [value]  ○ Sample checked, not repeated
                              ○ Could not check  [Not enough sample ▾]
 ☐ The label matches this patient, and there is no visible haemolysis or clot.        (signed wording)
 Who is alerted   Now: Dr Fixture Officer (ordered), Medical officer, Ward 4A
                  Not acknowledged by 11:12 → Ward 4A critical-results contacts
                  ⚠ Nobody is set up to receive this at the next level. Phone the ward now.      (amber)
 Note to the doctor [                                   ] 0/280
 [Cancel]                                                       [Release and alert]
 All results on this report are released as final. The mark, the check and every alert are recorded against your name.
```

After release the panel shows the alert's status (§2.3), never a bare "done". If delivery could not be queued:
"Released. The alert was NOT sent. Phone the ward now and log the call." (amber).

### 2.3 Criticals (artboard 3)

```
 Criticals                                     ⚠ Escalations may be delayed. Phone the ward for any open critical.
 Patient              Result                       Marked                 Alert
 Patient Seven-7      Potassium 7.2 mmol/L ▲       10:47 · Lab technologist Not acknowledged · 6 min        (amber)
 MS-2026-00007        Urea and electrolytes
 Patient Two-2        Glucose 1.2 mmol/L ▼         10:31                  Escalated 10:57 · waiting        (amber)
 Patient Nine-9       Creatinine …                  09:58                  Acknowledged 10:05 by Medical officer
 ─ detail ─ two identifiers · timeline (created, notified, seen, escalated, acknowledged, each with time and actor)
   Log a phone call: Who did you speak to? [staff search | Someone not on MedSync: name, role]
                     ☐ They read the result back correctly   [Log call]   [Could not reach anyone]
```

### 2.4 The doctor's alert (artboards 5, 7, 8)

```
 ▲ Critical result: Potassium 7.2 mmol/L, high.        (critical tint, triangle, the words — D-LAB1-18)
   Patient Seven-7 · MS-2026-00007 · Ward 4A · marked by the lab 4 min ago
   [Acknowledge]  [Open chart]
 ─ detail ─ the whole report with ranges and flags · From the lab: Repeated on the same sample (7.3) · note
   ○ Reviewing the patient now  ○ Asked the ward team to act  ○ Already aware      Note [ ]
   [Acknowledge]  ·  Call the lab: {lab number}  (only when lab_settings.lab_phone is set)
 after: "Acknowledged 10:59"  [Open chart]                                             (neutral, one line)
 escalated: "Escalated to you" · ⚠ "Not acknowledged for 12 minutes by Medical officer, Ward 4A." · [Acknowledge and take over]
```

Phone (390 px): sticky footer, Acknowledge 48 px, responses stacked. The header of every doctor page carries a neutral
count "1 critical" while any alert is open for the viewer.

### 2.5 Set-up (artboards 9, 10, 11)

- **Test catalogue:** Test · Section · Result type · Unit · Decimals · LOINC · State (Ready / Needs a unit). Unit from
  the curated UCUM list; locked once any result exists; "New version" otherwise.
- **Reference ranges:** editor (Sex · Age from · Age to · Low · High · Source), test list with state, preview for three
  example patients; two signatures (laboratory lead, CSO), each with a fresh second factor.
- **Critical limits, response times, contacts:** limits table (Test · Unit · Applies to · ≤ · ≥ · Reference id · Source);
  response times (acknowledge within; level 1 after; level 2 after), **no defaults**; contacts per department (level 1,
  defaulting to the head of department) and for the hospital (level 2). Amber: "Nobody will receive escalations for
  {department}." Limits and response times are two separately signed sets.

### 2.6 Downtime (artboards 12, 13) and one result path (artboard 14)

- **Print blank forms:** reserves N numbers (`DT-00031`…), one per A4 sheet; print CSS only; greyscale-legible.
- **Downtime entry:** form number · patient (MRN or name; never created here) · test · Collected (form) · Result time
  (form) · Released on paper by · the same results table · critical on the form? (phoned to, role, time, read back) ·
  [Save] [Save and next form] · "Saved as: resulted 13:40, entered 14:52."
- **Cut-over** (hospital admin, Departments and services → Laboratory): four conditions with state and action; "Switch to
  the new path" needs a second hospital admin.

---

## 3. The alert state machine

```
            created ──► open/sent ──(signed time passes)──► open/escalated(1) ──► open/escalated(2) (last: stays open)
               │            │  │                               │
               │            │  └─ could_not_reach ─────────────┘ (escalates at once)
               │            ├─ acknowledged (app, by an ordering clinician)              ──► acknowledged
               │            └─ call_logged + read-back to an ordering clinician          ──► acknowledged (via phone)
               └─ every level empty ──► open/not_sent ("phone the ward")             acknowledged (via phone)
                                                                                      └─ disputed ──► open (current level)
 corrected (amend of an alerted report) ──► a linked correction alert, created/sent like any other
```

| Rule  | Example (fixture)                                                                                                                   |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------- |
| CA-1  | U&E with potassium and urea both marked → one alert.                                                                                |
| CA-2  | Allowed states: open (sent, not_sent, escalated n) and acknowledged. No other value is representable (DB CHECK).                    |
| CA-3  | The alert row and `created` event are in the release transaction; queueing SMS fails → `notified … outcome failed`; release stands. |
| CA-4  | `critical_alert_events` refuses UPDATE and DELETE by trigger, for every role including the owner.                                   |
| CA-5  | Dr Fixture Officer opens the detail → `seen`; the lab still reads "Sent · waiting".                                                 |
| CA-6  | A medical officer in another department acknowledges → allowed; a nurse → refused; a second acknowledgement → returns the first.    |
| CA-7  | Acknowledged with "Reviewing the patient now" and no note → stored with channel `app`.                                              |
| CA-8  | Two taps with one client key → one alert, one acknowledgement.                                                                      |
| CA-9  | Lab logs a call with read-back to Dr Fixture Officer → acknowledged via phone; he disputes → open again, at its level.              |
| CA-10 | The lab amends potassium to 4.9 → `corrected`; a correction alert to every earlier recipient and the acknowledger.                  |
| CA-11 | Patient recorded deceased → the alert is still created and routed.                                                                  |
| CA-12 | Acknowledging writes the existing `result_acknowledgements` row; batch acknowledgement skips reports with an open alert.            |
| CA-13 | A second critical potassium for the same patient an hour later → a second alert.                                                    |
| CA-14 | Property tests over random event sequences (Step 3).                                                                                |

---

## 4. The recipient ladder (Test Hospital-1 fixture)

| Level | Rule                                                                                   | Fixture result                                                                                                                                                                               |
| ----- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | The ordering clinician; the open encounter's clinician if different                    | Dr Fixture Officer (MEDICAL_OFFICER, ordered and owns the encounter): one recipient                                                                                                          |
| 1     | The ordering department's critical-results contacts, in order; default: its head (hub) | Ward 4A has **no head and no contacts** → resolves to nobody → the lab is told in amber, and the alert moves to level 2 at once (RC-5)                                                       |
| 2     | The hospital's critical-results contacts                                               | None set in the fixture → **every escalation level empty**: after level 0 the alert stays open, and the panel says "Nobody is set up to receive this at the next level. Phone the ward now." |
| —     | Informed: the ward's nurse in charge                                                   | Not built: no nurse notification surface exists (D-LAB1-05)                                                                                                                                  |

Skipped and listed (RC-4): deactivated or suspended staff, staff without an affiliation at the hospital, and — for a
`restricted` report — anyone the restricted rule would refuse.

---

## 5. Schema diff (migrations 0102–0106, additive; GATED; owner-applied)

| Migration                       | Objects                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **0102 criticals**              | `lab_settings` (hospital PK: `lab_phone`, `second_check`, `sms_live`), `critical_response_versions` (hospital, version, status draft/signed, `ack_within_min`, `level1_after_min`, `level2_after_min`, author, two signers, CHECK signers differ, signed_at, superseded_at), `critical_contacts` (hospital, department nullable, level 1/2, user, position), `critical_marks` (report, concept, source manual/auto, limit_id, limit_version, direction, check kind, repeat value, could-not-check reason, sample_checked, second_checker / solo_reason, actor, at), `critical_alerts` (hospital, patient, report, order, correction_of, state open/acknowledged, sub_state sent/not_sent/escalated, level, sent_at, due_at, acknowledged_at/by/via/response/note, client_key UNIQUE), `critical_alert_events` (append-only), `escalation_heartbeats`, `lab_sms_templates` (kind, body, status draft/pending_review/approved/retired, first_approver, approved_by, CHECK two different approvers) |
| **0103 measures**               | `ucum_units` (curated: code, display, words), `loinc_codes` stays (0041) and gains rows by import; `lab_component_measures` (hospital, test, concept, version, result_type, unit_ucum, unit_display, decimal_places, loinc_code, entry_check_low/high, superseded_by, author), `lab_result_snapshots` (observation PK: value_decimal, unit_ucum, unit_display, measure version, range low/high/band/version, flag_computed, flag_final, flag_change_reason, entry_check_confirmed_by)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **0104 ranges and limits**      | `reference_range_versions` + `reference_range_bands`; `critical_limit_versions` + `critical_limits`; each version: author, `lead_signed_by/at`, `cso_signed_by/at`, CHECK the two signers differ and differ from the author when D-LAB1-12 applies (recorded exception otherwise)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **0105 downtime and cut-over**  | `downtime_periods`, `downtime_form_numbers` (hospital, number UNIQUE, state unused/entered/voided), `downtime_drills`, `downtime_entries` (report, form number, collected*at, resulted_at, entered_at, released_on_paper_by), `lab_cutover` (hospital, conditions snapshot, requested_by, approved_by CHECK differ, switched_at, reversed*\*)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **0106 realtime and scheduler** | RLS on `realtime.messages` for topic `user:<auth.uid()>`; `private.notify_user(user, payload)`; `pg_cron` + `pg_net` created **only if available** (PGlite skips), and `private.schedule_lab_escalations(url)` for the owner to run once with the app URL; the secret read from Vault                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

**RLS:** every new table is ENABLE + FORCE; reads through the clinical reader role scoped to the hospital (and, for
alerts, to the viewer's access or recipiency); **no client INSERT, UPDATE or DELETE anywhere**; writes as the owner after
the permission check, as every EMR write does. `critical_alert_events` additionally has a BEFORE UPDATE OR DELETE trigger
that raises.

**Probe plan (PGlite):** every object × {lab with permission, lab without `lab.manage`, recipient clinician, other
ordering clinician with access, clinician without access, nurse, reception, hospital admin, other hospital, superadmin
without break-glass, anonymous, any client write, UPDATE/DELETE on events as owner}.

---

## 6. Scheduler design

- `/api/cron/lab-escalations` (bearer `CRON_SECRET`): runs the executor for every hospital with open alerts; writes a
  heartbeat; never throws to the caller.
- `pg_cron` every minute: `net.http_post(url, headers => Authorization: Bearer <secret from Vault>)`. One call from the
  owner after applying 0106: `select private.schedule_lab_escalations('https://<host>/api/cron/lab-escalations');`
- Lazy path: every read of alerts (lab Criticals, the doctor's alert, the header count) runs the planner for that
  hospital first. Idempotent, so running from both is harmless.
- Heartbeat older than 3 minutes → the Criticals page shows "Escalations may be delayed…" (ES-5).

---

## 7. Restricted results (Law 12, with what the data allows)

Reports carry `restricted`, not a class. So: no SMS ever carries anything but the place (MS-1, for every report); a
`restricted` report's alert goes in the app only to recipients who have an access basis for the patient (RC-4), and
skipped recipients are listed; prints for patients and exports are out of this slice. Per-class filtering is recorded as
residual risk (hazard 16) until reports carry classes.

---

## 8. Sign-off packs (templates; **no values are proposed**)

**Critical limits** — per hospital: test · unit (from the catalogue) · age band (days) · critical at or below · critical
at or above · source and page · laboratory lead's note · CSO decision. Consult: the lab's current critical-call list;
RCPath G158 (May 2026) Appendices A and B; kit inserts; Ministry of Health or national laboratory guidance.

**Response times** — per hospital: acknowledge within (minutes) · level 1 after · level 2 after · level-1 contact for
each department · level-2 contacts. Consult: RCPath G158 (type A: within 2 hours); the hospital's escalation practice.

**Reference ranges** — per test: sex · age from · age to · low · high · unit · source · local verification (20 local
reference samples, accept if ≤ 2 fall outside; CLSI EP28-A3c).

---

## 9. Appendix A strings

All twenty-three entries of the prompt's Appendix A ship verbatim in `content/lab-criticals.ts`, each with `status:
"draft"`. Production refuses `labCriticals` while any wording it uses is draft, and refuses `labUnitsRanges` while the
range and unit strings are draft (Steps 4, 5).

---

## 10. Hazard log (draft; the CSO signs it at Step 8)

| #   | Hazard                                                       | Control built                                                                                           | Proving test                                 | Residual risk                         |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------- |
| 1   | Critical released, no alert                                  | Mark and alert in the release transaction; CA-14 property                                               | lane `criticals-release`; property test      | Low                                   |
| 2   | Alert reaches nobody                                         | RC-5 next level at once; `not_sent` + "phone the ward"; delivery failure never rolls back               | S4, S5, S6                                   | Medium: depends on contacts being set |
| 3   | Wrong or off-duty clinician                                  | Recipients resolved at send time and stored; deactivated skipped; escalation to department and hospital | RC tests, S3                                 | Medium: no rota (D-LAB1-07)           |
| 4   | Acknowledged by someone who cannot act                       | Only ordering cadres acknowledge; nurses never                                                          | CA-6 tests, S16                              | Low                                   |
| 5   | "Sent" read as "acknowledged"                                | Three words, three events; `seen` never shown as acknowledgement                                        | UI copy test; CA-5                           | Low                                   |
| 6   | Escalation job stops unnoticed                               | Heartbeat + amber notice; lazy path on every read                                                       | S14                                          | Low                                   |
| 7   | Alert fatigue                                                | None in this slice (every critical alerts, D-LAB1-15); alert counts measured                            | —                                            | **Open**                              |
| 8   | Wrong value alerted; correction not reaching the same people | Correction alert to every earlier recipient and the acknowledger                                        | S12                                          | Low                                   |
| 9   | Wrong patient (live or back-entry)                           | Two identifiers on every screen; back-entry finds registered patients only                              | S43; identity tests                          | Medium                                |
| 10  | Wrong unit typed                                             | Unit locked by the catalogue; no conversion; entry check                                                | S20–S22, S26                                 | Low (flag on)                         |
| 11  | Unit changed, old results misread                            | New version only; snapshot keeps the old unit                                                           | S26                                          | Low                                   |
| 12  | Range applied to the wrong sex or age                        | Resolver by sex and age at collection in days; adult never for a child                                  | `resolveRange` table tests, S23              | Low                                   |
| 13  | Limit mis-set or in the wrong unit                           | Two signatures; wrong-unit limits never fire                                                            | S32, S34                                     | Medium: values are human-set          |
| 14  | Set-up edit changes a released result                        | Snapshots on every result; signed versions never edited                                                 | Snapshot immutability test, S25              | Low                                   |
| 15  | SMS reveals a patient                                        | Renderers take kind and place only; banned-term scan in CI                                              | MS-2 scan with a failing fixture             | Low                                   |
| 16  | Restricted result shown through an alert                     | Restricted alerts only to recipients with an access basis                                               | S15                                          | **Medium: classes not on reports**    |
| 17  | Back-entry carries the entry time                            | Form times stored and shown; "Entered after downtime"                                                   | S38                                          | Low                                   |
| 18  | Paper form lost or entered twice                             | Server-reserved numbers; one entry per number; count of unentered forms                                 | S37, S39                                     | Medium: paper itself                  |
| 19  | Critical on paper never communicated                         | Saving a critical without a logged call opens a live alert                                              | S41                                          | Low                                   |
| 20  | Two result paths                                             | Cut-over with four conditions; legacy writes refused after                                              | S45–S47                                      | Low after switch                      |
| 21  | One person signs and approves their own change               | Database CHECKs on two different signers and approvers; exception recorded in words                     | S24, S46                                     | **Medium: one CSO-owner today**       |
| 22  | Wrong device clock                                           | Server time everywhere; monotonic tick                                                                  | TA-6 (Phase 0), escalation fixed-clock tests | Low                                   |
| 23  | Pregnancy-specific ranges                                    | None (D-LAB1-21)                                                                                        | —                                            | **Open**                              |
| 24  | Decimal comma misread on the legacy path ("7,2" → 72)        | The legacy list's critical check is unsigned; legacy writes close at cut-over                           | Legacy parse test documents it               | Low after switch                      |

---

## 11. Test plan, rollout, ADRs

- **Tests:** pure engines (every rule ID, table and property tests, the banned-term scan) in `tests/lab/**`; database
  behaviour, RLS probes, append-only proof, snapshots and every scenario that writes in the PGlite lane
  `tests/emr-db/lab-*.test.ts`; screens, timings, axe and red-scarcity in the harness and `tests/design`.
- **Rollout per hospital (D-LAB1-25):** `LAB_CRITICALS` (needs signed response times, signed wording and a level-1
  contact for every live department) → `LAB_UNITS_RANGES` (every orderable in-house test has a unit; signed wording) →
  signed limits (switches automatic flagging on by data, not a flag) → `LAB_DOWNTIME` → the cut-over.
- **ADRs 0239–0250:** critical-results engine; sent, seen, acknowledged; recipient ladder; escalation and heartbeat;
  phone acknowledgement and dispute; corrections; fixed units and no conversion; reference-range store and snapshots;
  limits and response times as signed sets; downtime; cut-over; the red-law amendment (D-LAB1-18).

---

## 12. Decisions

All prompt recommendations stand, with these settled by Step 0:

| #            | Decision                   | Recommendation                                                                                                                                                                                                                                                        |
| ------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-LAB1-01–25 | As in the prompt's §14     | As recommended there                                                                                                                                                                                                                                                  |
| D-LAB1-05    | Nurse in charge informed   | **No surface exists:** record the seam; not built                                                                                                                                                                                                                     |
| D-LAB1-17    | SMS                        | Built with the logging transport; live sending needs `lab_settings.sms_live`, an approved template and Africa's Talking configured. Staff numbers have no verification today: turning `sms_live` on is the hospital's confirmation that the numbers on file are right |
| D-LAB1-26    | **New:** units vs D-CFC-14 | Fixed, no conversion, behind `labUnitsRanges`; D-CFC-14 unchanged when off (owner, 11 Oct)                                                                                                                                                                            |
| D-LAB1-27    | **New:** scheduler         | `pg_cron` + `pg_net` + lazy path + heartbeat (owner, 11 Oct)                                                                                                                                                                                                          |
| D-LAB1-28    | **New:** test tooling      | The scratch harness (owner, 11 Oct)                                                                                                                                                                                                                                   |
| D-LAB1-29    | **New:** who sees an alert | Its recipients and any ordering clinician with an access basis for the patient; a recipient without a basis sees the alert, and "Open chart" follows the chart's own rule                                                                                             |
| E-LAB1-02    | Storage                    | Dedicated tables (no reusable per-hospital signed store exists)                                                                                                                                                                                                       |

### Signature

| Item                                    | Signed by           | Date        | Basis                                                                                     |
| --------------------------------------- | ------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| D-LAB1-01 to -29, E-LAB1-01 to -07      | Fadhul (owner, CSO) | 11 Oct 2026 | Instruction in session: "go through all steps of phase 1"; Step 0 answers of the same day |
| Appendix A wording                      | **Not signed**      | —           | Clinical-safety text: needs the CSO's explicit signature                                  |
| Hazard log                              | **Not signed**      | —           | Signed at Step 8                                                                          |
| Critical limits, response times, ranges | **Not signed**      | —           | Values come from the laboratory lead and the CSO, through the set-up screens              |
