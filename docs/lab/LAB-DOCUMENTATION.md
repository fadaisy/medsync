# MedSync Laboratory: complete documentation

Version of 17 Oct 2026, written at the end of Lab Phase 5 (branch `feat/lab-beyond-lis`). It describes the whole
laboratory module, Phases 0 to 5: what it does, who uses it, how it is built, how it is switched on, what is signed,
and what is still open. Each phase's own folder (`docs/lab/phase-N/`) holds the full prompt, STOP reports, GATE A,
hazard log, user guide and final report; this document is the map over them.

---

## Contents

1. [What the laboratory module is](#1-what-the-laboratory-module-is)
2. [The life of a test](#2-the-life-of-a-test)
3. [Who uses it: roles, permissions and signatures](#3-who-uses-it-roles-permissions-and-signatures)
4. [Screens by place](#4-screens-by-place)
5. [How it is built](#5-how-it-is-built)
6. [Feature flags and switching on](#6-feature-flags-and-switching-on)
7. [Phase 0: the front door](#7-phase-0-the-front-door)
8. [Phase 1: the safety floor](#8-phase-1-the-safety-floor)
9. [Phase 2: one menu, one record, catalogue v2](#9-phase-2-one-menu-one-record-catalogue-v2)
10. [Phase 3: quality, registers and reports](#10-phase-3-quality-registers-and-reports)
11. [Phase 4: referred tests and the exchange](#11-phase-4-referred-tests-and-the-exchange)
12. [Phase 5: patients, delta checks and infection prevention](#12-phase-5-patients-delta-checks-and-infection-prevention)
13. [Data model: migrations 0097 to 0157](#13-data-model-migrations-0097-to-0157)
14. [Clinical safety](#14-clinical-safety)
15. [Operations runbook](#15-operations-runbook)
16. [Testing](#16-testing)
17. [Status and open items](#17-status-and-open-items)
18. [Rule code glossary](#18-rule-code-glossary)
19. [Decision records (ADRs)](#19-decision-records-adrs)
20. [Where to read more](#20-where-to-read-more)

---

## 1. What the laboratory module is

MedSync's laboratory module runs a hospital laboratory inside the same record as the doctor's orders and the
patient's chart. A test ordered on the ward is collected with a checked label, received by scan, resulted with fixed
units and the hospital's own signed ranges, released with a critical alert where needed, and read by the doctor and,
since Phase 5, by the patient. Around that path sit quality control, stock and lots, equipment, external quality
assessment, registers, HMIS 105, reports, referral to other laboratories, a machine-to-machine exchange, delta checks
and a feed to infection prevention.

Five principles hold everywhere:

- **No clinical number ships in code.** Units, ranges, critical limits, response times, delta limits, release rules,
  plain words and alert lists are entered by the hospital's leads and **signed** (a lead, then a second signer,
  usually the Clinical Safety Officer) before they act. Where nothing is signed, nothing happens automatically.
- **Records are append-only.** Results, events, alerts, marks, holds and views are written once; corrections are new
  versions. Demo data is never deleted either; it lives in a demo hospital.
- **Decision support, never autonomous.** Nothing releases a result without a person (autoverification is not built),
  nothing orders a precaution, nothing reports a case to the national system.
- **Everything new is behind a per-hospital flag**, and stays off in production until the phase's patient- and
  clinician-facing wording is signed by the CSO.
- **Least exposure.** Restricted tests (HIV, TB, mental health, sexual and reproductive health) are named only to those
  who need them; patients never see the never-shown groups; IPC sees a minimum dataset; SMS carry no clinical content.

### The phases

| Phase | Name                               | Branch                       | State (17 Oct 2026)                                                       |
| ----- | ---------------------------------- | ---------------------------- | ------------------------------------------------------------------------- |
| 0     | The front door                     | `feat/lab-front-door`        | Merged (PR #225), live                                                    |
| 1     | The safety floor                   | `feat/lab-safety-floor`      | Merged (PR #227), migrations applied, copy and hazards signed             |
| 2     | One menu, one record; catalogue v2 | `feat/lab-one-menu`          | Merged (PRs #229, #230), applied, copy signed; CFC v1.6 addendum unsigned |
| 3     | Quality, registers and reports     | `feat/lab-quality-registers` | Merged (PRs #236, #237), applied, copy signed                             |
| 4     | Referred tests and the exchange    | `feat/lab-connect-outward`   | Merged (PR #238), copy signed, ADR 0327 countersigned, deployed           |
| 5     | Beyond a standard LIS              | `feat/lab-beyond-lis`        | Built and committed locally, not pushed; 0154–0157 unapplied; copy draft  |

---

## 2. The life of a test

```
Doctor orders ──▶ Collector labels & checks ──▶ Lab receives (scan) ──▶ Technologist enters ──▶ Release
   (one menu,        (payment chip, label          (live worklist,           (fixed units, signed       │
   availability)      vs wristband, high risk)      undo 5 min)               range, flag, delta)        │
                                                                                                          ▼
     Patient app ◀── "The patient sees it" ◀── Doctor reviews ◀── Critical alert & escalation ◀── Snapshot
  (Phase 5 gate)       (told, hold, note)       (acknowledges)      (Phase 1, if critical)     (units, range,
                                                                                                lots, QC, flags)
           also: IPC alert (Phase 5) · results-ready SMS (Phase 5) · HMIS 105 and registers (Phase 3)
           or:   To refer ─▶ manifest ─▶ reference lab ─▶ result back on the original order (Phase 4)
           or:   bedside device result with lot and operator (Phase 2), device checks and competency (Phase 3)
```

1. **Order (Phase 2).** The doctor picks from one menu that says, for today at this hospital, whether each test is done
   here, referred, down or not offered. The order keeps a snapshot of that availability.
2. **Payment (Phase 2).** Where the hospital charges, the specimen shows a payment state. An emergency is never held.
3. **Collection (Phase 2).** The collector scans or types the label; a mismatch with the wristband cannot be overridden.
   A high-risk specimen (for example fever with bleeding) carries an amber warning to every surface and the procedure.
4. **Receipt (Phases 0, 2).** The lab scans to receive; the worklist updates live, split by section and stage, with a
   turnaround clock on server time.
5. **Quality gates (Phase 3).** A lot must be accepted before use; QC must pass for the component on that analyser, or
   the result is held (a recorded override is possible).
6. **Entry (Phases 1, 2).** Values are typed in the component's fixed unit, parsed strictly, flagged against the signed
   reference range (or a signed decision scheme), and checked against the signed critical limits. eGFR is calculated
   where signed. A delta check compares with the patient's previous result (Phase 5).
7. **Release (Phases 1, 5).** Release snapshots units, range, flag, lots and QC. A critical value cannot be released
   without its check, and raises an alert to the orderer, escalating through the department and hospital contacts. An
   unresolved delta flag disables release. A matching IPC alert is raised in the same transaction.
8. **Review (Phase 1, 5).** The doctor acknowledges (critical first). Phase 5 adds what the patient sees and the told,
   hold and note acts.
9. **Patient (Phase 5).** Visible only through the one gate: after review, after "I have spoken to them" for a
   critical, never for the never-shown groups, with consent, under the signed release table. A text tells the patient
   results are ready, between 06:00 and 19:00.
10. **Reporting (Phase 3).** The daily register, HMIS 105 (including 10.4 for referrals) and lab reports count from the
    same records.

---

## 3. Who uses it: roles, permissions and signatures

### Permissions (`lib/lab/access.ts`, maps in `data/lab/permission-map.v*.json`)

| Permission                                            | Who holds it                                                                       | Added   | Lets them                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- | ------- | --------------------------------------------------- |
| `lab.view`                                            | Lab technicians and technologists (cadres `LAB_TECH`, `LAB_TECHNOLOGIST`)          | Phase 0 | Open `/lab` and lab reads                           |
| `lab.collect`                                         | Lab cadres (nurses and doctors collect by their own surfaces)                      | Phase 0 | Collect                                             |
| `lab.receive`                                         | Lab cadres                                                                         | Phase 0 | Receive and reject specimens                        |
| `lab.result.enter`                                    | Lab cadres                                                                         | Phase 0 | Enter results                                       |
| `lab.result.release`                                  | Lab cadres (technicians and technologists both release)                            | Phase 0 | Release; also "users with HIV access" for registers |
| `lab.manage`                                          | Head of the Laboratory or of a section (`department_heads`, substantive or acting) | Phase 0 | Set-up and signing in the lead slot                 |
| `lab.qc.override`, `lab.eqa.manage`, `lab.hmis.check` | With `lab.manage`                                                                  | Phase 3 | QC override, EQA, HMIS check                        |
| `lab.stock.manage`, `poct.assess`                     | Cadres in permission map v2 (draft, so `lab.manage` stands in)                     | Phase 3 | Stock; bedside competency assessment                |
| `lab.refer`, `lab.refer.result`, `lab.match.resolve`  | Cadres in permission map v3 (draft, so v2 applies)                                 | Phase 4 | Send out, enter referred results, resolve matches   |
| `lab.exchange.manage`                                 | Headship                                                                           | Phase 4 | Pair and manage machine connections                 |

Access is derived, never granted by hand: a trigger on `staff_affiliations` (0097) keeps the carrier role `lab_tech`
in step with an approved lab-cadre affiliation and audits every change; a `lab_work` access basis (0101) lets lab staff
reach patients with a lab order at the hospital in the last 30 days. Reception, hospital admins and superadmins hold no
lab permission. Every check runs on the server.

### Other actors

- **Doctors and clinical officers** (`INTERN_DOCTOR`, `MEDICAL_OFFICER`, `MEDICAL_OFFICER_SG`, `CONSULTANT`,
  `SENIOR_CONSULTANT`, `CLINICAL_OFFICER`) order, acknowledge criticals (nurses never do) and, since Phase 5, record
  told events, holds and notes for patients.
- **Collectors**: nurses and clinicians at the bedside; **bedside operators** are granted per device by the lead.
- **Cashier**: the reception cadre on `/reception/lab-payments`.
- **Designations** (`hospital_designations`, named by the hospital admin): data protection lead, IPC lead (Phase 4);
  IPC link nurse and surveillance focal person (Phase 5). HMIS In-Charge and focal person live in `hmis_designations`
  (Phase 3).
- **CSO**: signs as a superadmin at `/admin/lab-signoffs` (there is no separate CSO role). Today the owner, Fadhul, is
  owner, superadmin and CSO; that exception (D-LAB1-12) is recorded in words.

### Who signs what

Signed data lives in `lab_signed_configs` (one table since Phase 2, with versions, an author, a lead slot and a second
slot) or in its own versioned tables (ranges, limits, response times). **The author never signs their own draft**
unless they record why no one else can (D-LAB1-12). Signing needs a fresh second factor.

| What                                                                                                             | First signer                 | Second signer                   |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------- |
| Reference ranges, critical limits, response times (Phase 1)                                                      | Laboratory lead              | CSO                             |
| Decision schemes, flag basis, elevation, HIV algorithm, CFC addendum                                             | Laboratory lead              | CSO                             |
| REF entries (eGFR, IFCC)                                                                                         | CSO (global)                 | —                               |
| NCD lab-feed mappings                                                                                            | Registry lead                | CSO                             |
| QC plans and policy                                                                                              | Laboratory lead              | CSO                             |
| Kit and stain rules, acceptance plans, device rules, competency validity, register columns                       | Laboratory lead (alone)      | —                               |
| HMIS 105 mapping                                                                                                 | Laboratory lead              | HMIS focal person               |
| HMIS 105 monthly report                                                                                          | Lead checks                  | In-Charge signs                 |
| Partner tests, packing, referral operations                                                                      | Laboratory lead              | (second lead per the guide)     |
| Partner legal record and field list                                                                              | Data protection lead (alone) | —                               |
| High-risk referral wording                                                                                       | IPC lead                     | CSO                             |
| Delta, panel and pattern rules; release table; plain words; minors rule; SMS template; floor additions (Phase 5) | Laboratory lead              | CSO                             |
| Results consent wording (Phase 5)                                                                                | Data protection lead (alone) | —                               |
| IPC alert-list entry (Phase 5)                                                                                   | IPC lead                     | Laboratory lead (`lab_counter`) |
| Each phase's patient and clinician wording (`LABn_COPY_STATUS`)                                                  | CSO                          | —                               |

---

## 4. Screens by place

### Laboratory workspace `/lab` (needs `lab.view`; each page also needs its flag)

| Route                                                                    | Phase | What                                                                                                         |
| ------------------------------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------ |
| `/lab`                                                                   | 0, 2  | Worklist by section and stage; scan to receive, undo, Receive anyway, Find a specimen; live                  |
| `/lab/released`, `/lab/rejected`                                         | 0     | Released today; rejected in the last 7 days with re-collection state                                         |
| `/lab/results/[orderId]`                                                 | 0–5   | Result entry: units, range, flag, critical mark and check, QC word and hold, profile rows, eGFR, delta panel |
| `/lab/criticals`, `/lab/criticals/[id]`                                  | 1     | Critical alerts, timeline, phone call with read-back                                                         |
| `/lab/downtime`, `/lab/downtime/print`                                   | 1     | Back-entry of paper forms; numbered blank forms; drills                                                      |
| `/lab/older`                                                             | 1     | Legacy results after the one-result-path switch                                                              |
| `/lab/refer`, manifest print                                             | 2, 4  | To refer; send panel, manifests, handover                                                                    |
| `/lab/referrals`, `/[id]/result`                                         | 4     | Referral tracker; paper result back with scan and second check                                               |
| `/lab/exchange`, `/matches`, `/analysers`, `/partners`                   | 4     | Connections, reconciliation queue, analyser status, partner register                                         |
| `/lab/quality`, `/qc`, `/qc/run`, `/nonconformities`, `/eqa`, `/bedside` | 3     | Quality today, QC, nonconformities, EQA, bedside quality                                                     |
| `/lab/stock`, `/receive`, `/order`                                       | 3     | Stock and lots                                                                                               |
| `/lab/equipment`                                                         | 3     | Equipment register, logs, breakdowns                                                                         |
| `/lab/register`, `/lab/hmis`, `/lab/reports`                             | 3     | Daily register, HMIS 105, lab reports and indicators                                                         |
| `/lab/setup/catalogue`, `/ranges`, `/limits`, `/criticals`               | 1     | Units, ranges, limits, response and contacts (`lab.manage`)                                                  |
| `/lab/setup/menu`, `/profiles`, `/drafts`, `/settings`                   | 2     | Test menu links, analyser profiles, research drafts, lab settings                                            |
| `/lab/setup/delta`                                                       | 5     | Delta, panel and pattern rules, RCV calculator, trial                                                        |
| `/lab/setup/patient-release`                                             | 5     | Release table, plain words, minors rule, SMS template, floor additions                                       |
| `/lab/setup/demo`                                                        | 5     | Demo lab day (demo hospitals only)                                                                           |

### Clinicians

- `/doctor/results`: Results to review (critical first), Sent out, waiting (Phase 4), **The patient sees it** (Phase 5).
- `/doctor/criticals`, pinned alert, chart banner (Phase 1); order sheet with today's availability, collection sheet,
  high-risk flag, request form (Phase 2); bedside entry on doctor and nurse patient pages (Phase 2).
- `/nurse/bedside/devices`: daily device checks and own competency (Phase 3).
- `/ncd/visit/[id]`: "From the lab" fields (Phase 2).

### Other places

- `/reception/lab-payments` (Phase 2), `/hmis` desk (Phase 3), `/hospital-admin/reports` laboratory tiles (Phase 3),
  `/hospital-admin/departments/diagnostics/one-result-path` (Phase 1), `/hospital-admin/records-requests` (Phase 5).
- `/referral-governance`: data protection lead, IPC lead and hospital admin (Phase 4; consent wording Phase 5).
- `/ipc`, `/ipc/list`, `/ipc/surveillance`: infection prevention (Phase 5).
- `/patient/results`, `/patient/results/[id]` (Phase 5).
- `/admin/lab-signoffs`: the CSO's countersignatures.

---

## 5. How it is built

- **Stack.** Next.js 16 App Router (server components and server actions), Supabase Postgres with row-level security on
  every table, Drizzle schema (`db/schema/lab-*.ts`) kept in parity with SQL migrations by a test, Tailwind v4 with the
  MedSync Chroma design system.
- **Pure engines** in `lib/lab/*.ts`, `lib/ipc/lab-alerts.ts`, `lib/notify/results-ready.ts`, `lib/exchange/*`: no I/O,
  no clock, every rule code tested (for example `turnaround.ts`, `ranges.ts`, `flags.ts`, `criticals/escalation.ts`,
  `interpretation.ts`, `egfr.ts`, `one-menu.ts`, `qc-rules.ts`, `hmis105.ts`, `referral.ts`, `match.ts`,
  `patient-release.ts`, `delta.ts`).
- **Stores** (`*-store.ts`) write inside transactions as the clinical writer (`asClinicalWriter`), audited by trigger;
  **reads** (`*-read.ts`) run as the clinical reader under RLS or, for aggregates, as the owner after scope checks;
  **actions** (`*-actions.ts`) validate with zod, check AAL2, scope and permission, then call one store.
- **The one result path.** All lab results go through `writeReportVersion` (`lib/emr/write/results.ts`); Phase 1's
  cut-over closed the legacy path. Hooks there add snapshots (Phase 1), QC holds (Phase 3), referred provenance
  (Phase 4), delta checks and IPC alerts (Phase 5).
- **Signed configuration.** `lab_signed_configs` holds every signed kind, with its zod payload in
  `lib/lab/signed-config.ts`, signing in `lib/lab/catalogue-v2.ts` (`saveConfigDraft`, `signConfig`) and the slots per
  kind (`leadSlotFor`, `secondSlotFor`). A draft never acts; a signed version is in force from its signing time.
- **Copy as data.** Every string a patient or clinician reads lives in `content/lab*.ts` with a `*_COPY_STATUS`; the
  CSO signs it, and the phase's flags stay off in production until then (`workspaceLiveFor` in `lib/lab/feature.ts`).
- **Live updates.** The lab channel `lab:<hospital>` carries ids and counts only, with 15-second polling as fallback;
  critical alerts reach users on `user:<id>`.
- **Schedulers.** pg_cron through pg_net calls `/api/cron/lab-escalations` every minute (critical escalation, IPC
  escalation, results-ready SMS) and `/api/cron/exchange-outbox` every minute; `/api/cron/hmis-changes` runs nightly;
  the booking dispatcher (`/api/cron/dispatch-reminders`) is separate.
- **Design rules.** Red only for the pinned critical alert, the Critical pill and the patient Emergency button; amber
  for warnings and waits; square neutral tags for workflow state; centred dialogs (no side sheets).

---

## 6. Feature flags and switching on

Every flag is an environment variable: `1` for every hospital or a comma-separated list of hospital ids. All are off by
default. Except `NCD_LAB_FEED`, each needs `LAB_WORKSPACE`. Each phase's flags are refused in production while that
phase's copy is a draft.

| Flag                                                                                                                   | Phase | Needs                                 | Production gate                                                                        |
| ---------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------- | -------------------------------------------------------------------------------------- |
| `LAB_WORKSPACE`                                                                                                        | 0     | —                                     | `CRITICAL_FLAGGING_NOTICE` signed                                                      |
| `LAB_CRITICALS`                                                                                                        | 1     | workspace                             | `CRITICALS_COPY_STATUS` signed; every recently active department has a level-1 contact |
| `LAB_UNITS_RANGES`                                                                                                     | 1     | workspace                             | every test in use has a unit                                                           |
| `LAB_DOWNTIME`                                                                                                         | 1     | workspace                             | —                                                                                      |
| `LAB_CATALOGUE_V2`, `LAB_ONE_MENU`, `LAB_PAYMENT`, `LAB_COLLECTION_CHECK`, `LAB_BENCH`, `LAB_HIGH_RISK`, `LAB_BEDSIDE` | 2     | workspace                             | `LAB2_COPY_STATUS` signed                                                              |
| `NCD_LAB_FEED`                                                                                                         | 2     | —                                     | `LAB2_COPY_STATUS` signed                                                              |
| `LAB_STOCK`, `LAB_EQUIPMENT`, `LAB_EQA`, `LAB_HMIS`, `LAB_REPORTS`                                                     | 3     | workspace                             | `LAB3_COPY_STATUS` signed                                                              |
| `LAB_QC`                                                                                                               | 3     | stock, units and ranges               | as above                                                                               |
| `LAB_QC_HOLD`                                                                                                          | 3     | QC                                    | as above                                                                               |
| `LAB_POCT_QUALITY`                                                                                                     | 3     | bedside, stock                        | as above                                                                               |
| `LAB_REFERRAL`                                                                                                         | 4     | one menu, high risk, units and ranges | `LAB4_COPY_STATUS` signed                                                              |
| `LAB_EXCHANGE`                                                                                                         | 4     | referral                              | as above                                                                               |
| `LAB_DELTA_CHECKS`, `IPC_LAB_FEED`, `PATIENT_RESULTS`                                                                  | 5     | units and ranges                      | `LAB5_COPY_STATUS` signed                                                              |
| `PATIENT_RESULTS_SMS`                                                                                                  | 5     | patient results                       | as above                                                                               |

Automatic critical flagging has no flag: it starts when a hospital's limits and response times are both signed.
Everything also needs `EMR_V1` (and its `ENCOUNTER_ENGINE_LIVE`) for the hospital.

**Recommended order at a new hospital:** workspace → units and ranges (sign units, ranges) → criticals (sign limits,
response times, contacts) → downtime → catalogue v2 → one menu → collection check and high risk → bench → payment
(charging sites only) → bedside → NCD feed → stock → equipment → QC (logging only for at least 20 days) → QC hold → EQA
→ bedside quality → reports → HMIS (after the parallel month) → referral → exchange → delta checks (rules signed) → IPC
feed (alert list signed, designations named) → patient results (release table, plain words, minors rule and consent
wording signed; legal opinion and privacy notice in place) → results-ready SMS (template signed, sender registered).

---

## 7. Phase 0: the front door

**Purpose.** Lab staff had no proper way in: approval did not grant a lab role, `/lab` had no structure, waiting times
had no target and result screens did not say critical flagging was off. Phase 0 added derived access, a landing
resolver, a workspace with a worklist by section and stage, a server-time turnaround clock and a non-dismissable notice
that automatic critical flagging is off. No new clinical write path.

**Built.** `/lab` worklist (sections, stages To receive / To result / Preliminary, ward filter, sort, URL-held view, one
action per row, turnaround on a 30-second tick); `/lab/released`; `/lab/rejected`; the notice on `/lab/results/[id]`;
`/not-authorised`. Legacy hospitals keep the old list with a note.

**Rules.** Access LA-1..8 (`lib/lab/access.ts`), landing LD-1..6 (`lib/auth/landing.ts`, a 37-row table test),
worklist LW-1..12 (`lib/lab/worklist.ts`, including a 500-worklist property test), turnaround TA-1..8
(`lib/lab/turnaround.ts`: from receipt to release, hub target only when unambiguous, "Late by", server time), nav
NV-1..3, notice CF-1..3.

**Data.** 0097 (access sync trigger, audited; not gated), 0101 (the `lab_work` access basis, a hotfix applied 11 Oct).

**ADRs** 0221–0226, 0238. **Tests:** `tests/lab/{access,landing,routing,worklist-projection,turnaround,nav-flagging,
feature,ui,privacy,flag-off}`, lanes `lab-access`, `lab-reads`; S1–S17 pass; axe 0 in 15 runs.

**Status.** Merged (PR #225), live. Not recorded: whether the production backfill (`npm run lab:backfill-access`) ran.

---

## 8. Phase 1: the safety floor

**Purpose.** A critical value could be released with no alert, units were converted, ranges were typed, there was no
downtime plan and two result paths ran side by side. Phase 1 added critical alerts with acknowledgement and escalation,
fixed units without conversion, signed per-hospital ranges and limits with snapshots, downtime forms and back-entry, and
a two-admin cut-over to one result path.

**Built.**

- Result entry with fixed unit, strict parsing, entry check, signed range band and computed flag (changeable with a
  reason), the mark panel (Mark critical, check type, Release and alert), **Check and release** for auto-flagged values.
- `/lab/criticals` with timeline, phone call with read-back, "Could not reach anyone", and a heartbeat warning.
- Doctor: pinned alert, header count, `/doctor/criticals` (Acknowledge, Not me, Acknowledge and take over), chart
  banner, Critical results lane; batch acknowledgement skips reports with an open alert.
- Set-up: catalogue (UCUM unit, decimals, LOINC, entry check, versioned), ranges (bands by sex and age in days with a
  source), limits, response times and contacts, SMS wording with two approvers.
- Downtime: numbered forms, back-entry with the form's times, drills. Cut-over page for two hospital admins; reversal
  by two superadmins. The scheduler `/api/cron/lab-escalations`.

**Rules.** Units UN-1..8; ranges RR-1..8 (`resolveRange`); flags FL-1..7 (`computeFlag`, `evaluateCritical`); marks
CM-1..5; alerts CA-1..14 (one per report, created in the release transaction, append-only events, first acknowledgement
wins, phone acknowledgement can be disputed, corrections reopen); recipients RC-1..7 (orderer, department contacts,
hospital contacts); escalation ES-1..5 (pure planner, cron plus lazy path, heartbeat); messages MS-1..4 (kind and place
only, banned-term scan); downtime DT-1..8; cut-over CO-1..5.

**Data.** 0102 (criticals tables), 0103 (UCUM units, measures, snapshots), 0104 (ranges and limits as signed versioned
sets), 0105 (downtime and cut-over), 0106 (realtime per user, scheduler). All gated, applied.

**ADRs** 0239–0250. **Tests:** `tests/lab/phase-1/*` (CA-14 property tests over 300 event sequences and 300
hospitals), lanes `lab-safety-data`, `lab-criticals` (S1–S19), `lab-units` (S20–S29), `lab-limits` (S30–S36),
`lab-downtime` (S37–S44), `lab-cutover` (S45–S48). All 72 rule codes tested.

**Hazards.** 26, signed by the CSO on 12 Oct; 24 controlled, 2 open by decision (alert fatigue; pregnancy ranges).

**Status.** Merged (PR #227), applied, copy and hazard log signed. Each hospital's limits, ranges and response times
are signed at go-live. Open: realtime delivery time not measured; whether the escalation schedule
(`private.schedule_lab_escalations`) is running in production is not recorded; push notifications and the nurse in
charge are not built.

---

## 9. Phase 2: one menu, one record, catalogue v2

**Purpose.** Complete the test catalogue from the signed research (every parameter, analyser profiles, decision schemes
apart from reference intervals; researched ranges as unsigned drafts), and connect the lab to ordering, collection, the
bench, the bedside and the NCD registry.

**Built.**

- **One menu**: "Today at this hospital" on the order sheet, plan basket and resus close-out (`lib/lab/one-menu-read.ts`);
  orders refuse tests not offered or not linked and snapshot availability; "Also at the bedside".
- **Collection**: payment chips (an emergency is never held), label scan against the wristband with no override, amber
  high-risk block, void and reprint; request and downtime forms print the high-risk box.
- **Cashier** `/reception/lab-payments` (restricted tests counted, never named).
- **Bench**: scan to receive, undo within 5 minutes, Receive anyway with a reason, live worklist, Procedure followed for
  high-risk specimens.
- **Result entry**: analyser profile rows (lab-only rows hidden from clinicians), "Flagged against" with the scheme
  category, eGFR (CKD-EPI 2021, adults, IDMS-traceable method only), the clinical question with an audited "Show the
  working diagnosis".
- **Set-up**: test menu links to hub offerings, analyser profiles, research drafts (import by hash, verification,
  rejecting one of two disagreeing sources), ranges and cut-offs (flag basis, schemes), lab settings (elevation, eGFR,
  HIV algorithm, payment mode, high-risk procedure, bedside devices, lots, operators), method register.
- **Bedside**: device, lot, operator, HI/LO, "Not for diagnosis", critical mark; on nurse and doctor patient pages.
- **NCD feed**: an NCD visit fills from released results through signed mappings.

**Rules.** Catalogue CC-1..10, HIV algorithm AL-1..4, profiles AP-1..7, methods and eGFR ME-1..2 and EG-1..5, schemes
DS-1..11, research import RI-1..8, one menu OM-1..8, payment PY-1..6, identity ID-1, receipt SR-1..5, live LV-4,
context CX-2/4, high risk HR-1/2, bedside PC-1..10, NCD feed NF-1..8 (NF-8 deferred), display DP-1..3.

**Data.** 0107 (catalogue v2: `lab_signed_configs`, provenance on ranges, methods, restricted class, analyser profiles,
research imports), 0108 (CFC v1.6 concepts), 0109 (one menu: labels, test services, payment events, identity checks,
high-risk events, live broadcast, `lab_awaiting_payment`), 0110 (bedside devices, lots, operators), 0111 (NCD feed).

**ADRs** 0251–0259. **Tests:** `tests/lab/phase-2/*`, lanes `lab-phase2-data`, `lab-catalogue-v2`, `lab-one-menu`,
`lab-collection`, `lab-bench`, `lab-bedside`, `ncd-lab-feed`.

**Status.** Merged (PRs #229, #230 and follow-ups #231, #232), applied, copy signed 13 Oct. **Not signed:** the CFC
v1.6 addendum (key `cfc-1.6.0`, lead at `/lab/setup/drafts`, then the CSO), the hazard log, each hospital's schemes,
flag bases, elevation, HIV algorithm and NCD mappings. Open: bench timing p95 with `scripts/lab/bench-timing.js`; the
lab lead confirms the DH-615 research-use blocklist.

---

## 10. Phase 3: quality, registers and reports

**Purpose.** Move the lab's paper quality and reporting onto the same record: QC with Levey-Jennings and Westgard,
holds when QC fails and a look-back, stock and lots (FEFO, acceptance before use, a lot snapshot on every result),
equipment, EQA, nonconformities, bedside device checks and competency, the daily register, HMIS 105 and lab reports.

**Built.** Quality today; QC (analysers, kits and stains; run entry with the chart, rules in words, Reject run and
hold); nonconformities (actions, look-back decisions, resumption, close); EQA (schemes, rounds, the provider's scores,
alternative assessments, coverage); bedside quality (device rules, competency, strip-lot ranges); stock (FEFO issue,
counts, quarantine, acceptance plans, receive, order request); equipment (register, schedules, down and back in
service, logs, breakdowns through the hub); the daily register (restricted registers to `lab.result.release` holders,
every print logged); HMIS 105 (count the month, hand cells, check, print, CSV, revisions; `/hmis` desk for the
In-Charge's signature and the focal person); lab reports (eight indicators, drill-down for lab roles, numbers only for
admins); result-entry QC words and holds; nurse device checks.

**Rules.** Stock ST-1..10, acceptance LA-1..6, lots in use LU-1..3, equipment EQ-1..6, kit QC KQ-1..6, QC QQ-1..3 and
QR-1..4 (1-3s, 2-2s, R-4s, 4-1s, 10-x reject; 1-2s warns), holds QH-1..6, look-back LB-1..4, nonconformities NC-1..5,
EQA EA-1..6, bedside BQ-1..5, register DR-1..5, HMIS HM-1..13, indicators QI-1..4 (empty means "No data", never 0 %).

**Data.** 0112 (stock and lots; `poct_lots` moved), 0113 (equipment on `devices`), 0114 (QC, nonconformities,
look-back, `qc_held`), 0115 (EQA), 0116 (competencies), 0117 (registers, HMIS, designations), 0118 (indicators).
23 new tables.

**ADRs** 0300–0311. **Tests:** `tests/lab/phase-3/*` (175 engine tests; every rule code), lanes `lab-phase3-data`,
`lab-stock` (S1–S10), `lab-equipment` (S11–S14), `lab-qc` (S15–S28), `lab-eqa`, `lab-bedside-quality`, `lab-hmis`
(S38–S44), `lab-reports` (S46–S49), `lab-signing` (S53).

**Status.** Merged (PRs #236, #237), applied, copy signed 16 Oct. **Not signed:** hazard log, permission map v2, every
sign-off pack. **Owner actions:** OA-1 verify the 134 HMIS rows (`data/lab/hmis105-2019-09.json`, all unverified, so
no mapping can be signed); OA-2 eHMIS ids and org unit; OA-3 paper register columns; OA-9 name the In-Charge and focal
person; OA-10 the parallel month (`parallel-run.md`). Known gaps include QC re-pinning, certificate storage and
competency revocation.

---

## 11. Phase 4: referred tests and the exchange

**Purpose.** Give a specimen sent to a reference lab a record from To refer to its result: partners, manifests without
patient names, tracking, and results back on the original order with provenance, the reference lab's units and ranges,
a scan and a second check. Build a generic, append-only exchange for machine connections. Partner, analyser and
national connections were built only where their real-world inputs existed; none did, so those steps are gap reports.

**Built.** To refer with the send panel (partner, form numbers, packing items; Add to manifest only when complete;
aliquots; outbreak referrals for high-risk specimens); manifest print (Code 128, no names, "Copy" on reprints);
referrals tracker (Now chips, updates with their source, cancel request, rejected, lost opening a nonconformity); paper
result back (identity check, scan, printed units and ranges, second checker); the reconciliation queue (MA-1, never
create or pick); Connections (pairing with a one-time code, enabling by fingerprint, outbox, dead letters); Analysers
(waiting for the maker's document); Partners; the referral governance desk; the doctor's "Sent out, waiting"; HMIS 10.4
from records; machine APIs (`/api/exchange/*`) and the outbox cron.

**Rules.** Referrals RF-1..12 (FHIR Task states, EX-7 ordering, overdue from signed turnaround in Kampala working
days), manifests MF-1..4, results back RB-1..10 (only the partner's printed range; critical limits in the hospital's
unit, ADR 0327), exchange EX-1..10 (store before acknowledge, outbox, de-duplication, no PHI in logs), matching
MA-1..9, partners PT-1..6, FHIR FX-1..7 (structural check), HMIS HM-14..17, machine identity by signed JWT.

**Data.** 0150 (partners, designations, partner signed kinds), 0151 (referrals, events, manifests, aliquots), 0152
(results back, provenance, scans bucket), 0153 (exchange senders, tokens, messages, events, outbox, match items,
`private.schedule_exchange_outbox`).

**ADRs** 0312–0327. **Tests:** `tests/lab/phase-4/*` (188 referral transition tests, JWT refusals), lanes
`lab-phase4-data`, `lab-referral` (S1–S28), `lab-exchange` (S15, S29–S38 against a simulator); axe 0 over 26 states.

**Status.** Merged (PR #238), migrations applied by the owner, outbox scheduled every minute, copy signed, ADR 0327
countersigned, deployed. **Not signed:** hazard scores, permission map v3 (so `lab.refer` falls back to v2), GATE S.
**Deferred:** the per-address rate limit on `/api/exchange/pair` and `/token` (needs the Vercel Pro plan's firewall)
before any machine goes live. **Gap reports:** `partner-gap.md`, `analyser-gap.md`, `national-gap.md`; the NHLDS
letter is drafted, not sent.

---

## 12. Phase 5: patients, delta checks and infection prevention

**Purpose.** Go beyond a standard LIS: let patients see their own results safely, catch wrong-patient samples with
delta checks, and feed infection prevention from released results. Autoverification and microbiology were conditional
and are gap reports.

### 12.1 What patients see (Steps 6, 7)

- **One gate** (`visibleToPatient`, ADR 0328), evaluated over a snapshot: never-shown → minors rule → consent →
  released and current → signed release table → being checked → reviewed → told (critical) → held → visible.
- **The never-shown floor**: HIV, TB, mental health, sexual and reproductive health classes, urine pregnancy, tissue
  and cytology, plus signed additions. In code and in the database (`private.never_shown`); never listed, never named,
  never announced. Proved by a 200,000-case property test.
- **Doctor**: "The patient sees it" on `/doctor/results` with the chip and three acts: **I have spoken to them**,
  **Hold from the patient** (reason, until-date within the signed maximum, CSO monthly list), **Note to patient**;
  aged unreviewed results listed (ADR 0329).
- **Patient**: `/patient/results` (Ready cards with status words; Not ready to show yet; the in-person line; Your
  choices) and `/patient/results/[id]` (range line with its words, signed plain words, earlier results, note,
  Emergency line, provenance, corrections struck through). The account is the record; guardians by hospital link only;
  nothing stored on the device; views recorded (ADR 0330). "Ask for a copy" opens a records request; a hold never
  blocks it (`/hospital-admin/records-requests`).
- **Lab lead** (`/lab/setup/patient-release`): release table, plain words (ADR 0331), minors rule, SMS template, floor
  additions. **Data protection lead** (`/referral-governance`): the consent wording, whose signing publishes the
  consent versions (ADR 0339).

### 12.2 Results-ready SMS (Step 8, ADR 0332)

Its own sender on the minute tick; queued only when a result becomes visible in a group that allows SMS, to a
recipient with `results_sms` consent (the guardian for a child); one per 60-minute window; 06:00 to 19:00 Kampala only;
only the signed template (hospital name, no test, value, clinic or link, STOP included, one GSM-7 part); consent and
STOP checked at send; provider id and cost kept, body never; five retries with backoff.

### 12.3 Delta checks (Step 4, ADRs 0333, 0334)

Rules (absolute, percent, rate, RCV with a log-normal form; panel; pattern) signed with basis and source; evaluated at
save with the rules in force now and the history at specimen time; an in-house release is disabled until each flag has
an outcome and a note; recollect rejects as a possible wrong sample, mislabel opens a nonconformity; flag rates reviewed
monthly; a read-only trial over past results.

### 12.4 Infection prevention feed (Step 5, ADRs 0335, 0336)

Alerts from the signed list raised in the release transaction (or at an outbreak referral), one per patient per
condition per episode; minimum dataset; IPC's recorded actions set and clear the patient flag; readmission and moves
alert by trigger; escalation after an hour; `/ipc` (alerts, alert list, surveillance with IDSR counts per epi-week and
a printable digest). The bed board shows only the precaution.

### 12.5 Gaps (Steps 9, 10, ADR 0337) and the demo loader (ADR 0338)

Autoverification needs an interfaced analyser, three months of live delta checks and current QC
(`autoverify-gap.md`); the microbiology feed needs a microbiology module (`micro-gap.md`). The demo lab day loads eight
"Demo patient" records with tests at every stage into a hospital marked as a demo hospital, with results at the middle
of the hospital's own signed ranges.

**Data.** 0154 (patient results), 0155 (delta checks), 0156 (IPC feed), 0157 (lab demo), all GATED and unapplied.

**Tests.** `tests/lab/phase-5/{baseline,patient-release,results-ready,delta,ipc,flags,hardening}.test.ts`; lanes
`lab-phase5-data`, `lab-delta` (S1–S10), `lab-ipc` (S11–S20), `lab-patient-release` (S21–S27),
`lab-patient-results` (S28–S38), `lab-results-sms` (S39–S43), `lab-demo`. Harness `~/Desktop/lab5-harness`.

---

## 13. Data model: migrations 0097 to 0157

| #         | Phase | Purpose                                                                                                            | State          |
| --------- | ----- | ------------------------------------------------------------------------------------------------------------------ | -------------- |
| 0097      | 0     | Lab access sync trigger                                                                                            | Applied        |
| 0101      | 0/1   | `lab_work` access basis                                                                                            | Applied 11 Oct |
| 0102–0106 | 1     | Criticals, measures, ranges and limits, downtime and cut-over, realtime and scheduler                              | Applied        |
| 0107–0111 | 2     | Catalogue v2, CFC v1.6, one menu, bedside, NCD feed                                                                | Applied        |
| 0112–0118 | 3     | Stock, equipment, QC, EQA, competencies, registers and HMIS, indicators                                            | Applied        |
| 0150–0153 | 4     | Partners, referrals, results back, exchange                                                                        | Applied        |
| 0154      | 5     | Patient release, told, holds, notes, views, guardians, records requests, consent types, `patient_results_for_me()` | Unapplied      |
| 0155      | 5     | Delta flags and outcomes, delta signed kinds                                                                       | Unapplied      |
| 0156      | 5     | IPC alerts, actions, flags, list checks, readmission trigger                                                       | Unapplied      |
| 0157      | 5     | Lab demo hospitals, loads, patients                                                                                | Unapplied      |

Every table has RLS enabled and forced, client writes revoked, the audit trigger, and (for clinical events) an
append-only trigger. The Drizzle schema files are `db/schema/lab-safety.ts`, `lab-quality.ts`, `lab-exchange.ts`,
`lab-phase5.ts` and the EMR files. Migrations are immutable once shipped; GATED ones are applied by the owner in the
folder of the branch that holds them (`npm run db:migrate`).

---

## 14. Clinical safety

- **Hazard logs** per phase (`docs/lab/phase-N/hazard-log.md`): Phase 1 (26, signed), Phase 2 (30), Phase 3 (30),
  Phase 4 (40), Phase 5 (31, closed against tests at Step 11). Scores are the CSO's and the laboratory lead's.
- **Never in code:** ranges, limits, response times, delta limits, release rules, plain words, alert lists, IDSR items
  (transcribed and checked by the focal person), consent wording, SMS text.
- **Colour:** red is reserved; amber marks waits, warnings, holds and IPC alerts; state is always in words.
- **Restricted classes:** restricted tests are named only to those with a basis; registers print them separately;
  manifests print the partner's code; the cashier never sees them; patients never see the never-shown groups.
- **Two people:** cut-over and its reversal, SMS templates, every signed set, transcription of referred results.

---

## 15. Operations runbook

**Apply migrations** (owner): `cd <folder of the branch> && npm run db:migrate`, in numeric order. Phase 5:
0154 → 0155 → 0156 → 0157.

**Schedulers** (owner, once per environment, in the Supabase SQL editor):

```sql
SELECT private.schedule_lab_escalations('https://<host>/api/cron/lab-escalations');   -- 0106, every minute
SELECT private.schedule_exchange_outbox('https://<host>/api/cron/exchange-outbox');     -- 0153, every minute
```

Both read the Vault secret `medsync_cron_secret`, which must equal `CRON_SECRET`. The lab-escalations tick now also
sends results-ready messages.

**Switch on** per hospital by adding its id to the flag variables in the order of §6, after the signatures each step
needs.

**Demo hospital** (superadmin):

```sql
INSERT INTO public.lab_demo_hospitals (hospital_id, marked_by, note)
VALUES ('<demo hospital id>', '<your user id>', 'Demo hospital for the lab');
```

Then a laboratory lead there opens **Demo lab day** and presses **Load a demo lab day** (needs a doctor on staff and one
numeric test with units).

**Edge function:** redeploy `system-ussd-act` after Phase 5 so STOP also revokes `results_sms`.

**Before go-live:** unset `DEV_SKIP_MFA`; remove the trial hospital from `LAB_*` flags; set the Vercel firewall rate
limit for the exchange endpoints.

---

## 16. Testing

```bash
npm run typecheck && npm run lint && npm run test
```

```bash
EMR_PGLITE=1 npm run test:emr-db
```

- Unit and engine tests live in `tests/lab/` (by phase), `tests/lab/phase-5/hardening.test.ts` holds the PR-3 property
  and the budgets.
- PGlite lanes (`tests/emr-db/lab-*.test.ts`) run the real stores against all migrations with RLS probes; they need the
  local `@electric-sql` symlink and `EMR_PGLITE=1`. Run Phase 5 lanes without `LAB_ONE_MENU` set.
- Design tests (`tests/design/red-reserved.test.ts`) and the wards invariants guard colour and the bed board.
- Visual harnesses (outside the repo): `~/Desktop/lab0-harness` … `~/Desktop/lab5-harness` seed PGlite through the app's
  stores, build the app and take screenshots with axe via Chrome DevTools Protocol.

---

## 17. Status and open items

**Owner and CSO, by priority:**

1. Phase 5: review and push `feat/lab-beyond-lis`; apply 0154–0157; sign `LAB5_COPY_STATUS`; redeploy
   `system-ussd-act`.
2. Patient results (before any patient sees a result): the legal opinion (Q7: minors, the basis for app and SMS,
   holds and s.24); privacy notice, terms and PDPO registration (Q8); the data protection lead signs the consent
   wording; the lab lead and CSO sign the release table, plain words and minors rule.
3. Delta checks and IPC: rules and the alert list signed; IPC link nurse, IPC lead and surveillance focal person named;
   the focal person checks `idsr-transcription.md`; the 2025 IPC guideline chapters obtained (Q17).
4. SMS: the sender ID registered with Africa's Talking and the regulator (Q11, PS-7); a test handset message.
5. Phase 2: sign the CFC v1.6 addendum. Phase 3: verify the HMIS rows (OA-1), eHMIS ids (OA-2), the parallel month.
   Phase 4: GATE S, the rate limit, permission map v3, the NHLDS letter.
6. Hazard log scores and signatures for Phases 2–5; permission maps v2 and v3.
7. Unset `DEV_SKIP_MFA`; clean trial-hospital flags.

**Known gaps worth a phase of their own:** the analyser bridge (needs the maker's LIS document), autoverification,
microbiology, national connections, push notifications for criticals, a records-office link in the admin navigation,
the head of department's aged-results view, explanations and SMS in languages other than English.

**Record inconsistencies to tidy:** `docs/NUMBERS.md` still marks 0102–0118 "used (unapplied)" though they are
applied; Phase 4's FINAL-REPORT header still calls the copy a draft; `docs/lab/HANDOFF.md` predates Phase 4.

---

## 18. Rule code glossary

| Prefix                     | Meaning                            | Phase | Prefix         | Meaning                               | Phase |
| -------------------------- | ---------------------------------- | ----- | -------------- | ------------------------------------- | ----- |
| LA                         | Lab access / lot acceptance        | 0 / 3 | QQ, QR         | QC plans, QC rules                    | 3     |
| LD                         | Landing                            | 0     | QH             | QC holds                              | 3     |
| LW                         | Worklist                           | 0     | LB, NC         | Look-back, nonconformities            | 3     |
| TA                         | Turnaround                         | 0     | EA             | External quality assessment           | 3     |
| CF                         | Critical flagging seam / copy gate | 0, 1  | BQ             | Bedside quality                       | 3     |
| UN                         | Units                              | 1     | DR, HM         | Register, HMIS                        | 3, 4  |
| RR                         | Reference ranges                   | 1     | QI             | Quality indicators                    | 3     |
| FL                         | Flags                              | 1     | RF, MF         | Referrals, manifests                  | 4     |
| CM, CA                     | Critical marks, alerts             | 1     | RB             | Results back                          | 4     |
| RC, ES                     | Recipients, escalation             | 1     | EX, MA         | Exchange, matching                    | 4     |
| MS                         | Messages                           | 1     | PT, FX         | Partners, FHIR                        | 4     |
| DT, CO                     | Downtime, cut-over                 | 1     | PR             | Patient release                       | 5     |
| CC, AL                     | Catalogue v2, HIV algorithm        | 2     | PW, PS         | Plain words, results-ready SMS        | 5     |
| AP, ME, EG                 | Profiles, methods, eGFR            | 2     | DL             | Delta checks                          | 5     |
| DS, RI                     | Schemes, research import           | 2     | IC             | Infection prevention feed             | 5     |
| OM, PY, ID, SR, LV, CX, HR | One menu family                    | 2     | AV, MB         | Autoverification, microbiology (gap)  | 5     |
| PC, NF, DP                 | Bedside, NCD feed, display         | 2     | ST, LU, EQ, KQ | Stock, lots in use, equipment, kit QC | 3     |

---

## 19. Decision records (ADRs)

| Range     | Phase | Topics                                                                                                                                                                                                                           |
| --------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0221–0226 | 0     | Derived permissions, access sync, landing resolver, worklist projection, turnaround, flagging notice                                                                                                                             |
| 0238      | 0/1   | `lab_work` access basis                                                                                                                                                                                                          |
| 0239–0250 | 1     | Critical tables, fixed units, ranges, acknowledgement, recipient ladder, escalation, SMS, signed sets, auto flagging check, downtime, one result path, red reserved                                                              |
| 0251–0259 | 2     | CFC v1.6, signed configs and schemes, research import, methods and eGFR, one menu, payment, labels and receipt, clinical question and high risk, bedside and NCD feed                                                            |
| 0300–0311 | 3     | Stock ledger, acceptance, lots in use, equipment, QC plans, QC hold, nonconformities, EQA, bedside quality, register, HMIS 105, indicators                                                                                       |
| 0312–0327 | 4     | Referrals, manifests, results back, exchange store, matching, analyser bridge, machine identity, partners' legal records, national gate, Code 128, table prefixes, scans, FHIR check, HMIS 10.4, live events, referred criticals |
| 0328–0339 | 5     | Patient release gate, told and holds, results area, plain words, results-ready SMS, delta checks, delta decisions, IPC feed, bed-board precaution, gaps, demo loader, consent wording                                            |

All are in `docs/adr/`, mirrored in `CHANGELOG.md`.

---

## 20. Where to read more

- Phase folders: `docs/lab/phase-0/` to `docs/lab/phase-5/` (PROMPT, GATE A, STOP reports, hazard log, user guide,
  final report; Phase 4 also gate S, bridge and security, gap reports; Phase 5 also IDSR transcription and gap reports).
- `docs/lab/HANDOFF.md`: the running hand-off (update it for Phases 4 and 5).
- `docs/lab/catalogue-research/`: the signed catalogue research and its 25 decisions.
- `docs/NUMBERS.md`: claimed migration and ADR numbers.
- `docs/CLAUDE-HANDOFF.md`: owner rules and how to run the checks.
