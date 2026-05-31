# Smart Triage Engine — GATE A proposal (clinical sign-off)

**Status:** CSO-approved as written, 2026-05-31 — proceed through gates; defaults ratified, PEWS/MEOWS gaps to flag-and-compose; consolidated clinical manual pass + regression deferred to GATE F. (R1–R4 locked; §A.1/§A.2/§A.5/§B approved as written.)
**Branch:** `feat/triage-engine`
**Clinical source:** [`docs/clinical/triage-medical-research.md`](clinical/triage-medical-research.md) (committed verbatim; authoritative)
**This gate is a clinical sign-off, not just technical.** Nothing in §§B–F is built until Fadhul signs §A.

> All schema/identifier claims below were verified against the codebase by a read-only precondition sweep (six subsystems). Where the kickoff assumed something that does not exist, it is flagged honestly in §G rather than papered over.

---

## Preface — verified precondition state

| Precondition                        | State                | Verified reality (exact identifiers)                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vitals store                        | **usable**           | `clinical_observations` (mig 0031) is EAV: `observation_kind ∈ {bp, hr, temperature, rr, spo2, glucose, pain, weight, height, intake, output, gcs, other}` + `numeric_value_1`/`numeric_value_2` + free-text `unit` + `pain_scale`. **All NEWS2 inputs except consciousness are capturable today** (rr, hr, spo2, bp, temperature, glucose all present). Home `personal_health_logs` (`kind`-based) captures only spo2/bp/glucose/temperature → home _trend_ is partial (no home RR/HR/consciousness). |
| Entry points / queue                | **partial**          | `patient_intakes.status ∈ {declared, arrived, awaiting_triage, triaged, completed, cancelled}` — **`triaged` exists but has NO producer; triage IS the producer.** `priority_hint ∈ {routine, high, urgent}`. `queue_entries.sequence_number` is **pure FIFO arrival order — no priority column**. Greenfield: zero triage/acuity tables.                                                                                                                                                              |
| Cadre / RLS                         | **full**             | `cadres.is_clinical=true` is the reusable clinical-staff gate (RECEPTION is the only `is_clinical=false` cadre, already excluded at the DB). **`clinical_cosign_policies(hospital_id, department_id, cadre_code, action_kind, requirement∈{allowed,cosign_required,blocked})` is the existing capability mechanism** (ADR 0027/0030) — triage authority should ride it, not a bare constant.                                                                                                           |
| Audit / encryption / MFA            | **full**             | `sa_audit_log` + `recordSaAudit({actorId, action, targetKind, targetId, reason≥8, …})`; AES-256-GCM `encrypt()/decrypt()`; AAL2 enforced in every scope guard. `ha-record-observation` edge fn is the audited vitals-write model to mirror.                                                                                                                                                                                                                                                            |
| Nurse/doctor workspaces             | **full**             | `IncomingIntakesPanel` is **read-only** (clean slot for a triage action); `components/ui/sheet.tsx` ready; nurse feature registry `app/nurse/_lib/features.ts` has a clean `/nurse/triage` slot.                                                                                                                                                                                                                                                                                                       |
| Scheduling / notifications / config | **partial → 2 gaps** | `system-propose-urgent-appointment` exists (reuse). **No push/SMS dispatcher** — `appointment_reminders` queues rows but nothing sends them; `sa_notifications` is superadmin-only. **No alerts table; `appointments.triggered_by_alert_id` is an unlinked TEXT seam.** No `hospital_settings` table (triage_config would be net-new, following `department_scheduling_policy`'s shape).                                                                                                               |

---

## ✅ Ratified decisions (your sign-off this session — locked into the build)

| #   | Decision                     | Ruling                                                                                                                                                                                                                                                                                                                |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Down-triage authority**    | **Doctors / clinical officers only.** Nurses & midwives may triage and up-triage freely; only `DOCTOR_CADRE_CODES + CLINICAL_OFFICER` may assign a level _below_ the computed one. Modelled as `clinical_cosign_policies.action_kind='triage_downgrade'` (clinical cadres `blocked` except doctor/CO `allowed`).      |
| R2  | **Notifications gap**        | **In-app now, SMS/push stubbed.** Red/Orange → in-app clinical notification to the receiving department (extend `sa_notifications` to clinical staff); SMS/push behind a typed `NotificationSink` interface that no-ops with a logged TODO until a dispatcher build. Triage code unchanged when a real gateway lands. |
| R3  | **Population routing seams** | **Flag-don't-block + paeds 12–15.** Unknown pregnancy in a woman ~12–50: run adult NEWS2 **but** surface a "confirm pregnancy status" flag (never assume, never block). Ages 12–15 → **paediatric PEWS** (more sensitive).                                                                                            |
| R4  | **ACVPU capture**            | **Capture ACVPU directly.** Add `observation_kind='acvpu'` to `clinical_observations` (value stored as a coded scale A/C/V/P/U). Preserves NEWS2's load-bearing "new confusion = +3"; numeric `gcs` stays available but is not the triage consciousness input.                                                        |

---

## A. Clinical model — remaining items needing your sign-off

### A.1 — Five-tier level / colour / target-time defaults (research doc §1)

| Level | Colour     | Meaning                            | Default target | Disposition           |
| ----- | ---------- | ---------------------------------- | -------------- | --------------------- |
| 1     | Red        | Immediate life-saving intervention | 0 min          | Resus                 |
| 2     | Orange     | High risk / time-critical          | 10 min         | High-acuity           |
| 3     | Yellow     | Urgent, stable                     | 60 min         | Standard              |
| 4     | Green      | Less urgent                        | 120 min        | Standard / fast-track |
| 5     | Blue/White | Non-urgent                         | Routine        | Fast-track            |

Per-hospital configurable; these are the safe defaults. **Sign-off needed:** confirm the five tiers + times.

### A.2 — Discriminator list (SATS-style red-flags) → minimum acuity ⚠️ **the clinical heart**

Each forces a _minimum_ acuity regardless of score (Step 3/4 "worse-of"). Seeded from research doc §4/§5/§8; stored as reviewable, extensible reference data.

| Discriminator                                               | Min acuity | Applies to | Source       |
| ----------------------------------------------------------- | ---------- | ---------- | ------------ |
| Airway compromise / stridor                                 | Red (1)    | all        | ESI-A / SATS |
| Absent or agonal breathing                                  | Red (1)    | all        | Step 0       |
| No palpable pulse / cardiac arrest                          | Red (1)    | all        | Step 0       |
| Unresponsive (U on ACVPU)                                   | Red (1)    | all        | Step 0       |
| Active seizure                                              | Red (1)    | all        | SATS         |
| Exsanguinating / uncontrolled haemorrhage                   | Red (1)    | all        | SATS         |
| SpO₂ < 90% despite O₂                                       | Red (1)    | all        | research §11 |
| Glucose < 3.0 mmol/L                                        | Red (1)    | all        | research §6  |
| Cardiac-sounding chest pain                                 | Orange (2) | adult      | ESI-B        |
| Focal neuro deficit / suspected stroke                      | Orange (2) | all        | research §6  |
| Sepsis suspicion + (qSOFA ≥2 OR NEWS2 ≥5)                   | Orange (2) | adult      | research §5  |
| Severe respiratory distress (high RR, working hard)         | Orange (2) | all        | research §6  |
| Shock Index ≥ 1.0                                           | Orange (2) | adult      | research §6  |
| Obstetric: SBP ≥160 or DBP ≥110                             | Red (1)    | obstetric  | MEOWS §8     |
| Obstetric: seizure (eclampsia)                              | Red (1)    | obstetric  | MEOWS §8     |
| Obstetric: heavy PV bleeding                                | Red (1)    | obstetric  | MEOWS §8     |
| Obstetric: pre-eclampsia triad (headache+visual+epigastric) | Orange (2) | obstetric  | MEOWS §8     |
| Reduced fetal movements                                     | Orange (2) | obstetric  | MEOWS §8     |
| Paediatric: grunting / cyanosis / cap refill >3s            | Orange (2) | paediatric | PEWS §7      |
| Paediatric: non-blanching rash                              | Red (1)    | paediatric | PEWS §7      |
| Paediatric: infant <3 months, fever ≥38°C                   | Orange (2) | paediatric | PEWS §7      |
| Severe pain (≥7/10)                                         | Yellow (3) | all        | SATS/ESI     |

**Sign-off needed:** add / remove / re-rank. This is the list that most determines under-triage safety.

### A.3 — Population routing — RATIFIED (R3), recorded for completeness

Adult ≥16y non-pregnant → NEWS2. Paediatric <12y or <150cm **or 12–15y** → PEWS + age bands. Obstetric (pregnant / ≤6w postpartum) → MEOWS. Unknown pregnancy 12–50y → adult NEWS2 **+ confirm-pregnancy flag**, never blocked.

### A.4 — Override authority — RATIFIED (R1), recorded for completeness

| Cadre set                                                                                           | Triage     | Up-triage | Down-triage |
| --------------------------------------------------------------------------------------------------- | ---------- | --------- | ----------- |
| NURSE, MIDWIFE, SPECIALIST_NURSE                                                                    | ✅         | ✅        | ❌          |
| INTERN_DOCTOR, MEDICAL_OFFICER, MEDICAL_OFFICER_SG, CONSULTANT, SENIOR_CONSULTANT, CLINICAL_OFFICER | ✅         | ✅        | ✅ (reason) |
| RECEPTION (non-clinical)                                                                            | ❌ never   | ❌        | ❌          |
| PHARMACIST, LAB_TECH, etc.                                                                          | ❌ default | —         | —           |

Every triage + override (either direction) writes `sa_audit_log` with computed-vs-assigned + reason.

### A.5 — Baseline-adjustment floor (research doc §0; clinician-gated)

A clinician may apply a reasoned, audited baseline adjustment tempering over-triage for chronically-abnormal-baseline patients (TB/HIV) — but it can **never** pull below (a) a Step-0 life-threat or (b) a triggered red-flag discriminator. System never auto-tempers. **Sign-off needed:** confirm this floor is absolute.

### A.6 — ACVPU — RATIFIED (R4), recorded for completeness

`observation_kind='acvpu'`, value A/C/V/P/U. "C" (new confusion) scores NEWS2 +3.

---

## B. Schema proposal (migration 0036, additive only — greenfield confirmed)

1. **`triage_records`** — the medico-legal record (one per triage event):
   `id`, `intake_id` (FK `patient_intakes`), `patient_user_id`, `hospital_id`, `department_id`,
   `ruleset` (`adult_news2|paediatric_pews|obstetric_meows`),
   `vitals_snapshot` (jsonb — exact inputs + timestamps used), `computed_level` (1–5), `computed_score` (int),
   `computed_breakdown` (jsonb — each parameter's contribution, derived metrics, fired discriminators),
   `assigned_level` (1–5), `override_direction` (`up|down|none`), `override_reason` (text null),
   `baseline_adjusted` (bool), `baseline_reason` (text null), `life_threat_fast_tracked` (bool),
   `provisional` (bool — incomplete vitals), `triaged_by_user_id`, `triaged_at`, `created_at`.
   RLS: the **verbatim `cadres.is_clinical=true` predicate** from mig 0033 + patient-owns-own + superadmin.

2. **`triage_discriminators`** — reference data (§A.2): `code`, `label`, `min_acuity_level`, `applies_to` (`all|adult|paediatric|obstetric`), `sort_order`, `active`. CSO-gated changes, audited.

3. **`triage_config`** (per hospital, optional; mirrors `department_scheduling_policy`): target-times + threshold overrides (jsonb). Safe validated defaults when absent.

4. **`patient_intakes`** — add denormalized `triage_level` (int null) + `triaged_at` for cheap board sorting; the full record lives in `triage_records`. **`queue_entries`** gets a `priority_order` companion to `sequence_number` so triage can re-rank without destroying arrival order.

5. **`clinical_observations`** — widen `observation_kind` CHECK with `'acvpu'` (R4) + add nullable `triage_record_id` so triage-captured vitals are distinguishable from routine obs.

6. **`clinical_cosign_policies.action_kind`** — widen CHECK with `'triage_patient'` and `'triage_downgrade'`; seed clinical cadres `allowed` for `triage_patient` / reception `blocked`; seed `triage_downgrade` `allowed` only for doctor/CO cadres (R1).

7. **`sa_audit_log`** — widen `action` CHECK with `compute_triage`, `assign_triage`, `override_triage`, `adjust_triage_baseline`; widen `target_kind` with `triage_record`.

All `ADD COLUMN IF NOT EXISTS` / CHECK-widen patterns matching 0033–0035. No shipped migration altered.

---

## C–F. Build plan (gates unchanged from kickoff §7)

**B:** pure deterministic scoring core (`lib/triage/scoring/`, thresholds as constants from the research doc, unit-tested at every boundary). **C:** engine flow Steps 0–6. **D:** override (Step 7) + transparent triage UI (worklist + Sheet panel + trend view). **E:** integrations + routing (entry-points consume; emergency never blocked; outcome sets `triage_level`/`priority_order`/presence; urgent-appointment link; in-app Red/Orange notify). **F:** closeout + regression + CSO sign-off. Each stops.

### Key reuse (verified targets)

| Need              | Reuse                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------- |
| Vitals read/write | `clinical_observations` + `ha-record-observation` audited write model                   |
| Worklist          | extend `fetchHospitalIncomingIntakes` (`status='awaiting_triage'`)                      |
| Triage panel      | `components/ui/sheet.tsx`; extend read-only `IncomingIntakesPanel` with a triage action |
| Authority         | `clinical_cosign_policies` + `resolveCapabilities`-style resolver                       |
| Audit / PHI       | `recordSaAudit` / `encrypt`                                                             |
| Urgent appt       | `system-propose-urgent-appointment`                                                     |

---

## G. The two honest scope gaps (decided by R2; recorded)

- **G.1 Notifications:** no push/SMS dispatcher exists. → in-app clinical notification now + stubbed `NotificationSink` (R2).
- **G.2 Monitoring-alert vital carry:** no alerts table; `triggered_by_alert_id` is an unlinked TEXT seam. → triage auto-populates from latest `clinical_observations`/`personal_health_logs` (still requiring a fresh confirmed set); clean seam left for a future FK. No fabricated alert.

---

## Remaining sign-off (the rest of the clinical gate)

1. **§A.1** five-tier target times — confirm?
2. **§A.2** discriminator list — add / remove / re-rank? _(highest-stakes clinical review)_
3. **§A.5** baseline-adjustment floor (life-threat + discriminator, absolute) — confirm?
4. **§B** schema shape — approve migration 0036 as scoped?

R1–R4 are locked. On your ruling for 1–4 I proceed to **GATE B** (the pure deterministic scoring core) — and not before.
