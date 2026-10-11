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
