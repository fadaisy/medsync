# Lab Phase 1 — STOP reports

Prompt: [PROMPT-LAB-PHASE-1.md](PROMPT-LAB-PHASE-1.md). Branch `feat/lab-safety-floor`, cut from `feat/lab-front-door`
@ `e66485f` (Lab Phase 0 + `origin/main` @ `8d43729`), worktree `~/Desktop/medsync-lab1`.

---

## STOP 0 — Discovery and baseline

No product code changed. Added: the prompt copy, this report, `tests/lab/phase-1-baseline.test.ts`.

### Verdict: four flags before Step 1

1. **No scheduler can run escalation every minute (ES-3: stop and flag).** Production timed work is Vercel cron only, and
   the plan allows **daily** schedules (`vercel.json`; `docs/ops-channels.md:45-57`). No `pg_cron`, `pg_net`, queue or
   scheduled function exists. Options, in the repo's own ops notes: (a) Supabase `pg_cron` + `pg_net` calling a
   secret-protected route every minute, the secret in Vault, one GATED migration, free; (b) Vercel Pro and a
   `* * * * *` cron; (c) an external pinger. **Recommended: (a)**, plus the lazy path on every read of alerts (ES-3).
2. **Playwright is not installed (Q19: stop and flag).** Same as Phase 0. **Recommended:** keep D-LAB0-19, the scratch
   harness (`~/Desktop/lab0-harness`: PGlite, Chrome over CDP, axe), which ran this baseline.
3. **New, and live in production today: lab staff lose access to a patient at midnight.** The EMR access rule
   (`private.patient_access_basis`, `0071:1056`) has no basis for laboratory work. A technologist matches only "open
   intake" (patient arrived **today** and still `arrived` / `awaiting_triage` / `triaged`); "department recent" never
   matches because the lab is never the encounter's department. So a specimen collected before midnight, or for a patient
   whose visit is `completed` (inpatients included), **cannot be resulted** ("No legitimate clinical access to this
   patient"). Reproduced in the harness at 00:15 Kampala. This needs a lab basis in the access rule (a GATED migration,
   CSO decision), independent of Phase 1, and arguably before it.
4. **Units are converted today, which Phase 1 forbids (UN-4).** The server accepts the typed unit, else the catalogue
   default, else the canonical unit, and converts to canonical (`lib/emr/write/results.ts:194-212`; D-CFC-14 asks "Is
   this mg/dL?"). Phase 1 says no value is ever converted. Moving to fixed units changes an existing, signed behaviour.
   **Decision needed at GATE A.**

### Q1 — Phase 0 present

Yes. Permissions `lib/lab/access.ts:12-19` (`lab.result.release` enforced at `lib/emr/write/results.ts:509`), registry
`lib/lab/nav.ts:24-44`, `criticalFlaggingActive` `lib/lab/critical-flagging.ts:12-17`, `LAB_WORKSPACE`
`lib/lab/feature.ts`. **Merged:** not into `main`; Phase 0 runs in production from `feat/lab-front-door` (owner's
choice not to push). The branch is cut from it.

### Q2 — Claims

| #   | Verdict       | Evidence                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Confirmed     | `recordCriticalCommunication` `lib/emr/write/results.ts:790` → `critical_result_communications` (`0071:983-995`: who, to whom, role, method, read_back, time). UI `components/emr/results/critical-comm.tsx`, shown only on a released **critical** report. All 8 `REF-CRIT-*` + timeframe `pending_cso` (`lib/emr/reference/critical.ts:38-65`). |
| F2  | Confirmed     | `app/lab/actions.ts:211-221`, legacy release only; `logger.warn`.                                                                                                                                                                                                                                                                                 |
| F3  | Confirmed     | `releaseResults` (`results.ts:504-538`) computes `critical` from **signed** refs only (`detectCritical`, `lib/emr/results.ts:244-268`), stores `diagnostic_reports.critical`, returns a warning string (`:404`). No notification of any kind.                                                                                                     |
| F4  | Confirmed     | `verifiedByUserId = actor`, never compared with `enteredByUserId` (`results.ts:529-531`).                                                                                                                                                                                                                                                         |
| F5  | Confirmed     | Low and high typed per value (`result-entry-view.tsx:365-375`, `model.ts:49-57,203-213`); stored in `clinical_observations.context.referenceRange` with `source: "lab"`. No range columns.                                                                                                                                                        |
| F6  | **Corrected** | Units are **not fixed**: `test_catalogue.default_units` (jsonb) gives a default; the picker offers every convertible unit (`model.ts:79-82`); the server converts to canonical (`results.ts:194-212`). 20 of 35 v1 tests have default units.                                                                                                      |
| F7  | Confirmed     | `/doctor/results` (`app/doctor/results/page.tsx`), batch acknowledgement (`components/emr/results/review-list.tsx:35-48`), `acknowledgeResults` (`results.ts:708-776`). A **`critical_results` lane already exists** (`lib/workspace/lanes.ts:60-69`).                                                                                            |
| F8  | Confirmed     | No downtime procedure in code or docs.                                                                                                                                                                                                                                                                                                            |
| F9  | Confirmed     | `app/lab/page.tsx:30-40`; `app/lab/_lib/emr.ts` uses the global `emrV1Live()`.                                                                                                                                                                                                                                                                    |
| F10 | Confirmed     | Realtime: `chart:<patient>` (`0073`), `workspace:<hospital>` (`0069:98-160`), resus, ward beds. **No per-user channel.**                                                                                                                                                                                                                          |
| F11 | Confirmed     | 44 rows (`0072` 35, `0092` 9).                                                                                                                                                                                                                                                                                                                    |

### Q3 — The result model

`clinical_observations` (`0071:559-592`): `value_num numeric`, `value_comparator`, `value_unit text` ("UCUM, as
reported"), `value_canonical numeric`, `value_code`, `context jsonb` (range, lab interpretation). Values pass through a JS
`number` and are written as `String(number)` (`results.ts:213-220`) — decimal in the column, float on the way.
Panels: `test_catalogue.components text[]` of concept ids. Reports are append-only versions (`logical_id`, `version`,
`supersedes_id`, no-mutation trigger); each version gets a full set of observation rows.

### Q4, Q12, Q14, Q16 — Counts

Not taken: production reads are blocked for this session. Run in the Supabase SQL editor (read-only):

```sql
-- Q4: results in the last 90 days by test, distinct units, typed ranges
select o.text as test, count(*) as results, count(distinct co.value_unit) as units,
       count(*) filter (where co.context ? 'referenceRange') as typed_ranges
from clinical_observations co join diagnostic_reports dr on dr.id = co.report_id
join encounter_orders o on o.id = dr.order_id
where dr.recorded_at > now() - interval '90 days' group by 1 order by 2 desc;
-- Q12: lab orders with no ordering user, last 90 days
select count(*) filter (where authored_by_user_id is null) as no_orderer, count(*) as all_orders
from encounter_orders where kind = 'lab' and created_at > now() - interval '90 days';
-- Q16: open legacy items per hospital
select hospital_id, count(*) from encounter_orders
where lifecycle = 'legacy' and kind = 'lab' and status in ('ordered','collected') group by 1;
```

Q14 needs no query: `patient_profiles.sex` and `date_of_birth` are **NOT NULL** (`db/schema/patient-profiles.ts:31-32`);
`sex` allows `intersex` and `prefer_not_say`, which can only match "Any" bands. No estimated-age flag on the profile.

### Q5 — Signed references

`RefEntry` (`lib/resus/reference/ref.ts:13-28`) is **code constants** with one status; no hospital, version or signer.
DB patterns that exist: `capability_values` (per hospital, `authored_by` ≠ `verified_by` CHECK, `0080:204-221`), NCD
snapshots and go-live requests. **No per-hospital, versioned, two-signature store.** E-LAB1-02 resolves to dedicated
tables shaped like `capability_values`.

### Q6 — Four-eyes and two-person approval

Three mechanisms, none shared: superadmin `sa_pending_approvals` (`_shared/four-eyes.ts`; the confirm function
`sa-confirm-action` is **not built**); the hub's CAP-5 (`capability_values`, `verifyVerdict` refuses the same person,
`ha-services-hub/ops-services.ts:395-553`); NCD SMS templates (`ncd_sms_template`, `first_approver <> approved_by`
CHECK, `lib/ncdreg/recall/templates.ts`). **Cut-over** fits the hub's CAP-5 pattern (hospital admins); **templates** fit
the NCD pattern.

### Q7 — Notifications and SMS

`sa_notifications` (kinds incl. triage and resus) has **no reader anywhere**: no bell, no inbox, no in-app surface.
`notification_dispatches` is patient-facing. SMS: Africa's Talking over fetch (`lib/notifications/africastalking.ts`);
the staff sink is a log-only stub (`lib/notifications/sink.ts:38-46`); the NCD logging transport and its
`live_sms_enabled` setting are NCD-only. **Only patient appointment reminders send today.** Staff phones exist
(`users.phone`, encrypted at sign-up) but are **unverified**.

### Q8 — Realtime

Private broadcast topics carrying `{kind, at}`; authorised by `private.may_hear_chart` and `is_active_clinical_staff`.
**No per-user channel**: one is needed (a migration). Polling fallback exists: `use-workspace-live.ts` (15 s while no
channel, 5 min with one, paused when hidden).

### Q9 — Scheduler

See verdict 1. Vercel cron, daily, `CRON_SECRET` bearer. Unscheduled routes exist (`ncd-reminders`).

### Q10 — Doctor side

`doctorWorkspace(hospital)` = `DOCTOR_WORKSPACE` + engine + resus v2 (`lib/workspace/feature.ts`). Lanes are a static
registry; `critical_results` exists and links to `/doctor/results`. The shell's top bar (`doctor-shell.tsx:137-192`)
can carry the count. **Baseline found:** the workspace's Results lane read **0** while `/doctor/results` listed **4**
(pre-existing; to investigate).

### Q11 — Who may order

`INTERN_DOCTOR, MEDICAL_OFFICER, MEDICAL_OFFICER_SG, CONSULTANT, SENIOR_CONSULTANT, CLINICAL_OFFICER`
(`lib/encounter/access.ts:13-20`).

### Q12 — Orderer and responsible clinician

`encounter_orders.authored_by_user_id` is **nullable**; `encounters.clinician_user_id` is NOT NULL; no doctor rota;
`requireResponsible` uses "the orderer or a clinician in the orderer's department" (`results.ts:667-706`). Level 0 can
resolve to orderer, else encounter clinician.

### Q13 — Hub

`department_heads` and `ward_in_charge_assignments` exist; an order's department is `encounters.department_id`
(nullable). **No lab phone number anywhere** (only `hospitals.emergency_phone` etc.).

### Q15 — Restricted classes

`sensitivity standard|restricted` on orders, reports and observations; classes exist only on `condition_relations`
(`private.can_view_restricted`, 0096). Reports carry no class: Law 12 can filter on `restricted`, not per class, until
reports carry classes.

### Q17 — FHIR

`lib/emr/fhir.ts` (tests only) emits the stored unit as the UCUM code **unchecked**; LOINC only when verified;
`DiagnosticReport.code` has no LOINC. 12 of 113 seeded concept LOINC codes are verified.

### Q18 — Print

Print CSS exists (`components/emr/print-layout.tsx`, A4, "no PDF engine"); 15 files use `print:`; no PDF dependency.

### Q20 — LOINC and UCUM

`loinc_codes` has **9 rows** (v2.77, `0041`). No UCUM list (a 17-entry display map and a conversion table only). LOINC
notice present in `THIRD-PARTY-NOTICES.md`; **UCUM notice missing**. The full LOINC table is large (on the order of
100,000 terms); size to be measured on download. **Recommended:** import the laboratory subset needed by the
catalogue, with the release version and notice.

### Q21 — Tokens

Critical (`status-critical-*`, `alert-*`), caution (`status-caution-*`), neutral chip and the lock pattern
(`RestrictedMark`) exist. The critical token is confined to `components/emr/status-word.tsx` by
`tests/design/red-reserved.test.ts`.

### Other findings

- **Decimal commas:** the EMR parser rejects "7,2" as not a number; the **legacy** critical check strips everything but
  digits, "." and "-", so "7,2" is read as 72 (`lib/lab/result-entry.ts:47`). Inert while the legacy list is unsigned;
  a hazard (Appendix B).
- Service-role key name is the legacy one (`lib/supabase/service.ts:17`), flagged again.

### Baseline (the "before")

Harness `~/Desktop/lab0-harness`, `shots/p1-before-lab/`, `shots/p1-before-doc/`:

1. The technologist enters a fasting glucose of 1.2 mmol/L (a harness fixture value, critical by any lab's standard)
   and releases: **"Result released."** No flag, no prompt to phone. The lab flag menu offers "LL — critical low" as an
   optional choice.
2. The ordering doctor's workspace: **Critical 0**, Results 0.
3. `/doctor/results`: the glucose sits **fourth of four**, "Awaiting acknowledgement", next to routine results, and
   "Select all" acknowledges it in a batch.

### Failing tests

`tests/lab/phase-1-baseline.test.ts`, `it.fails`: **F3** (no alert on release), **F5** (range typed), **F9** (no
single-path switch). 3 expected-fail.

### Prompt versus repo

| Prompt                                      | Repo                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------- |
| Phase 0 merged                              | On a branch that production runs; not on `main`                                       |
| A scheduler for every minute                | Daily Vercel cron only                                                                |
| Units fixed; never converted                | Units chosen per result and converted to canonical (signed D-CFC-14)                  |
| Signed-reference mechanism to reuse         | Code constants; dedicated tables needed                                               |
| Existing per-user channel                   | None; workspace and chart topics only                                                 |
| Existing in-app notification surface        | `sa_notifications` with no reader                                                     |
| Existing SMS provider and template store    | Africa's Talking provider; template two-person approval and live setting are NCD-only |
| Lab phone in hospital settings              | No setting exists                                                                     |
| `critical_results` lane to add              | Already exists                                                                        |
| Per-class restricted filtering              | Reports carry `restricted` only, not classes                                          |
| Lab staff can result the patients they hold | They lose access at midnight or when the visit completes                              |

---

## STOP 1 — GATE A proposal

[gate-a-proposal.md](gate-a-proposal.md): screens, the alert state machine with an example per rule, the recipient
ladder on the fixture (level 1 and level 2 resolve to nobody), migrations 0102–0106, the RLS probe plan, the scheduler
design, blank sign-off packs, the hazard log (24 hazards), the test and rollout plans, ADRs 0239–0250 and the decision
table.

- **Signed** 11 Oct 2026 by the owner's instruction ("go through all steps of phase 1"): D-LAB1-01 to -29, E-LAB1-01 to
  -07. New: D-LAB1-26 (units), -27 (scheduler), -28 (harness), -29 (who sees an alert).
- **Not signed:** Appendix A wording, the hazard log, every clinical number. Production refuses the flags that need them.
- Migration 0101 (lab access, ADR 0238) was applied by the owner on 11 Oct.

---

## STOP 2 — Data layer

Migrations **0102–0106** (unapplied; owner applies in order), `db/schema/lab-safety.ts`, the three flags, the UCUM
table and the LOINC import script.

| Migration | What                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| 0102      | Lab settings, response-time sets, contacts, alerts, marks, alert events, heartbeats, SMS templates           |
| 0103      | UCUM units (28 curated), component measures (immutable), result snapshots (append-only)                      |
| 0104      | Reference-range and critical-limit versions with bands/limits; signed sets frozen, status only moves forward |
| 0105      | Downtime periods, form numbers (entered once), entries (paper times), drills, briefings, cut-over            |
| 0106      | Per-user realtime topic `user:<id>`, `private.notify_user`, pg_cron + pg_net scheduler (where available)     |

### Proof

`tests/emr-db/lab-safety-data.test.ts`, 14 tests on the PGlite lane:

- No client INSERT, UPDATE or DELETE on any of the 21 tables; anonymous reads nothing.
- Another hospital's reader sees none of hospital A's rows.
- The lab (lab_work basis) sees the alert, mark, events and snapshot. A notified recipient with no access basis sees the
  alert but not the snapshot (D-LAB1-29). A clinician with neither sees no alert, and does see the hospital's set-up.
- Events, marks, snapshots and downtime entries raise on UPDATE and DELETE, as the owner too.
- Signed sets need two different signers, are frozen once signed, never move back, never lose a signature.
- A measure is immutable; a form number is entered once; SMS templates need two approvers; the cut-over a second.
- The realtime topic `user:<id>` is heard only by that user; the payload is `{alertId, at, kind}`.

Drizzle parity passes. Full suite: 8,810 passed, 3 expected-fail (F3, F5, F9). PGlite lane: 528 passed.

### Owner, after applying 0106

```sql
select vault.create_secret('<CRON_SECRET>', 'medsync_cron_secret');
select private.schedule_lab_escalations('https://<host>/api/cron/lab-escalations');
```

The LOINC import (`npm run lab:import-loinc -- <Loinc.csv> <release>`) is a dry run until `--apply`; the licence and
file are the owner's to download.

---

## STOP 3 — Engines

Pure modules, no I/O: `lib/lab/catalogue.ts`, `ranges.ts`, `flags.ts`, `criticals/{marks,alerts,recipients,escalation,messages}.ts`,
`downtime.ts`, `cutover.ts`, and CF-2 in `critical-flagging.ts`. Appendix A copy as data, all `draft`:
`content/lab-criticals.ts`.

**Tests:** `tests/lab/phase-1/`, 5 files, **114 passed**. Lab suite 238 passed, 3 expected-fail (F3, F5, F9). Typecheck
and lint clean. Every fixture number is invented and named as a fixture (`_fixtures.ts`).

### Rule coverage

| Group | Rules    | Tests                                                                                                            |
| ----- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| UN    | 1–8      | each; UN-5 a 17-row table (empty, "7,2", "7.20", "<0.1", "-", exponents, units, spaces)                          |
| RR    | 1–8      | each; age boundaries in days (0, 27, 28, 6569, 6570), neonates, gaps, missing sex/DOB, one- and two-way          |
| FL    | 1–7      | each; `evaluateCritical` table at and beyond both limits, neonatal limit, one-sided limit                        |
| CM    | 1–5      | each                                                                                                             |
| CA    | 1–14     | each; CA-14 below                                                                                                |
| RC    | 1–7      | each (RC-7: not resolved, D-LAB1-05)                                                                             |
| ES    | 1–5      | on time, late, two levels, an empty level, the last level, run twice, unsigned times, by hand                    |
| MS    | 1–4      | each; MS-2 scans both SMS drafts for four places against every seeded test name and every UCUM unit              |
| DT    | 1–8      | each                                                                                                             |
| CO    | 1–5      | each                                                                                                             |
| CF    | 2        | CF-2 here; **CF-1** (the loader that reads the sets, callers unchanged) is wired with automatic flagging, Step 6 |
| Law 8 | snapshot | a range and a limit replaced after release: the snapshot and the replay as at release are unchanged              |

Two-hospital fixture in every resolver and list: ranges, limits, recipients' contacts, acknowledgement, CF-2.

### Property tests (CA-14, seeded PRNG, no new dependency)

- 300 random event sequences of 30 events: every prefix stays in CA-2's states, levels never go down, the first
  acknowledgement wins, a phone acknowledgement always names who logged it. **0 failures.**
- 300 simulated hospitals of 40 ticks (releases with 0–3 marks, acknowledgements, scheduler runs, empty levels, unsigned
  times): every mark has its alert, no alert without a released report, one alert per report, nothing overdue below
  the last level, and every scheduler run is idempotent. **0 failures.**
- The invariant checker fails on each broken invariant fed to it.

### MS-2 failing fixture

"Akello on Ward 4A, Potassium 6.9 mmol/L, MRN 20261011, HIV clinic" → name, test, value, identifier and restricted
hits. A place called "TB Ward" makes the SMS refuse to render (skipped, the lab told), not send.

### For the owner (interpretations, nothing clinical)

1. **Response times.** Each level waits its own time from when the alert reached it: level 0 `acknowledge within`,
   level 1 `level 1 after`. Level 2 is the last level, so `level 2 after` only marks the alert overdue there; it never
   moves further (ES-4). Say if the sign-off pack should read differently.
2. **Two equal bands** (RR-3) store as "Unsigned range" with the conflict reported to set-up. Set-up also refuses to
   sign overlapping bands of one sex, so this can only arise from data edited outside MedSync.
3. **Age** is counted in calendar days on the hospital's clock (Africa/Kampala), so a sample at 01:00 counts as that
   day's. This matters at the neonatal boundaries.
4. **Decimal comma** is always a decimal point ("7,2" is 7.2; hazard 24). "1,234" is then 1.234, which is refused
   wherever the component allows fewer than 3 decimals.

---

## STOP 4 — Criticals by hand (behind `labCriticals`)

**Built:** the mark panel and Release and alert (one transaction: report, marks, alert); the alert's status on the
released result; **Criticals** (list, detail, timeline, Log a phone call, Could not reach anyone); the doctor's pinned
alert, header count, detail and one-tap acknowledgement, the dispute line, the chart banner, the Critical results lane;
batch acknowledgement excluding alerted reports; escalation by the scheduler route (`/api/cron/lab-escalations`), the
lazy path and a heartbeat; corrections on amendment; **critical-results set-up** (the lab's number, second check, SMS
switch, response times with the lead's signature, contacts per department and for the hospital, SMS wording with two
approvers); the CSO's countersignature in the super-admin console (**Lab sign-offs**); the production gate.

### Scenarios

| #   | Result                                                                                                                                                                 | Where                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| S1  | Pass. One transaction; one alert, one mark; the lab list shows "Sent · waiting 0 min"; the doctor's header shows "1 critical result"                                   | PGlite + harness              |
| S2  | Pass. One tap; "Acknowledged 10:28 by Medical Officer"; the report counts as reviewed; batch acknowledgement had excluded it                                           | PGlite + harness              |
| S3  | Pass. At the signed time an escalation is written; the contact sees "Escalated to you" and Acknowledge and take over; level 2 holds                                    | PGlite + harness              |
| S4  | Pass. The panel warns before release ("Nobody is set up…"); the alert passes the empty level at once and names it on the timeline                                      | PGlite + harness              |
| S5  | Pass. Every level empty: Not sent, at the last level, no due time; the release stands; the skipped orderer is listed as "left"                                         | PGlite                        |
| S6  | Pass. The push fails after commit: nothing throws, `notified … failed` is written, the lab reads "Not sent · phone the ward"                                           | PGlite                        |
| S7  | Pass. Read-back to the doctor acknowledges by phone; the doctor sees "The lab recorded your phone acknowledgement at 10:33. Not you? Tell us."; Not me reopens it      | PGlite + harness              |
| S8  | Pass. A call to a nurse (or to someone not on MedSync) is "Ward informed. The clock keeps running."                                                                    | PGlite + harness              |
| S9  | Pass. Could not reach anyone escalates at once                                                                                                                         | PGlite + harness              |
| S10 | Pass. Two acknowledgements: one wins, the second returns the first                                                                                                     | PGlite                        |
| S11 | Pass. A double tap replays the report and the alert                                                                                                                    | PGlite                        |
| S12 | Pass. The amendment opens "Corrected result: Potassium was 6.9, is now 4.9 mmol/L." to every earlier recipient and the acknowledger; it needs its own acknowledgement  | PGlite + harness              |
| S13 | Pass. Unsigned times: sent, never escalated by itself, the panel says so; Could not reach anyone still works                                                           | PGlite + harness (hospital 2) |
| S14 | Pass. With the scheduler silent, Criticals shows "Escalations may be delayed…" and the read escalates the overdue alert                                                | PGlite + harness              |
| S15 | Pass. A restricted result: a recipient without access is skipped and listed; no SMS is queued even with SMS on                                                         | PGlite                        |
| S16 | Pass. Another hospital's doctor, a receptionist, a clinician with no basis: not found; a nurse: may not acknowledge                                                    | PGlite + harness (404)        |
| S17 | Pass. Doctor workspace off: the alert is pinned on the Overview and on Results to review, and the header count shows                                                   | harness                       |
| S18 | Pass. 390 px: the pinned alert, the detail, Acknowledge in a 48 px sticky footer (moved clear of the Emergency button after the first run)                             | harness                       |
| S19 | Pass. Off: exactly the Phase 0 screens and 404 on every new route. Production refuses it while the wording is draft, or while a live department has no level-1 contact | unit + PGlite + harness       |

### Numbers (harness: `next dev`, PGlite, one machine — indicative, not production)

| Measure                           | Budget              | Result                                                                                       |
| --------------------------------- | ------------------- | -------------------------------------------------------------------------------------------- |
| Taps, technologist, with a repeat | ≤ 4 + the value     | 4 (Mark critical · Repeated · sample checks · Release and alert) + the repeat value          |
| Taps, doctor, to acknowledge      | 1                   | 1                                                                                            |
| Release with a mark, round trip   | p95 < 500 ms server | 193 ms observed in the browser, one sample                                                   |
| Acknowledge, round trip           | p95 < 300 ms server | 222 ms observed in the browser, one sample                                                   |
| Alert visible to an online doctor | ≤ 5 s / ≤ 15 s      | Not measurable here (no Supabase Realtime): the polling fallback is 15 s by construction     |
| Escalation after due              | ≤ 60 s              | At once on any read (lazy path); every minute once `private.schedule_lab_escalations` is run |
| Critical marks without an alert   | 0                   | 0 (CA-14 on the record, PGlite)                                                              |

### Screens

`~/Desktop/lab0-harness/shots/p1-s4/`: artboard 2 `b1-mark-panel-checked.png`, `c1-empty-level-panel.png`,
`d1-panel-preview.png`, `e1-panel-coded.png`, `f3-panel-unsigned.png`; artboard 3 `b2-lab-criticals.png`,
`c2-escalated-lab*.png`, `d1-release-phone-ack.png`, `d3-lab-ward-informed-timeline.png`; artboard 5 `b3-doctor-pinned*.png`,
`g2-workspace.png`; artboard 6 (SMS wording, two approvers) `a3-contacts.png`; artboard 7 `b4-doctor-phone*.png`;
artboard 8 `c3-escalated-*.png`; Results to review `e2-results-batch.png`; set-up `a1-setup-empty*.png`.

**axe:** 0 violations on every new screen (lab entry with the panel, Criticals, alert detail, set-up, the doctor's
pinned alert, detail and phone views, the workspace). The doctor pages with the workspace **off** report 10
colour-contrast nodes on the sidebar's dimmed "Soon" items: pre-existing, untouched here.

**Red:** `tests/design/red-reserved.test.ts` now holds the lab tree red-free (engines may hold "critical" as data,
never as a class) and allows the critical tint only on the pinned alert and the Critical pill, each with its icon and
words (D-LAB1-18).

### For the owner

1. **The CSO signs in the super-admin console** (Lab sign-offs): no in-app CSO role exists, so a superadmin signs as
   CSO, with a fresh second factor and D-LAB1-12's exception in words when it is the same person. The harness cannot
   render `/admin` (it needs the real Supabase service client), so that page is typechecked and built, not seen; the
   harness stood in with SQL for the CSO step.
2. **Second check (D-LAB1-06)** records the second lab user chosen by name, not by their own sign-in as §5.2 asks. A
   second sign-in on the same device needs a session flow that does not exist; the setting is off by default.
3. **A phone acknowledgement is not the doctor's review** of the report: it can be disputed, and a review record cannot
   be taken back. An acknowledgement in the app is the review (CA-12).
4. **"Fresh second factor"** = the authenticator code entered again within 10 minutes; the page asks for it in place.
5. **The Critical pill's icon** is the design system's critical octagon, not the triangle in D-LAB1-18's wording: the
   triangle means amber caution here. Say if it should change.
6. **`lab_sms_templates` gained `hospital_id`** (0102 is unapplied, so the file changed rather than a new migration):
   one hospital's approval must not send another's wording.
7. Not built, as recorded at GATE A: push; the informed nurse in charge (D-LAB1-05); per-class restricted filtering
   (reports carry `restricted` only).
8. **Apply 0102–0106**, then in SQL: `select vault.create_secret('<CRON_SECRET>', 'medsync_cron_secret');` and
   `select private.schedule_lab_escalations('https://<host>/api/cron/lab-escalations');`. Keep `LAB_CRITICALS` off in
   production until the Appendix A wording is signed and every live department has a level-1 contact (it refuses to
   turn on otherwise).
