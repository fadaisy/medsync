# Smart Triage Engine — GATE A proposal (clinical sign-off)

**Status:** Awaiting Clinical Safety Officer sign-off (2026-05-31)
**Branch:** `feat/triage-engine`
**Clinical source:** [`docs/clinical/triage-medical-research.md`](clinical/triage-medical-research.md) (committed verbatim; authoritative)
**This gate is a clinical sign-off, not just technical.** Nothing in §§B–F is built until Fadhul signs §A.

---

## Preface — verified precondition state (read-only investigation)

Every claim below was verified against the codebase, not assumed.

| Precondition                        | State                     | What this means for triage                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitals store                        | **partial**               | `clinical_observations` (mig 0031) already has **every NEWS2 parameter**: `respiratory_rate`, `spo2`, `blood_pressure_systolic`/`_diastolic`, `heart_rate`, `temperature`, `blood_glucose`, `gcs`, `pain_score`, `weight`, `height`. Home `health_readings` lacks RR + consciousness → home _trend_ is partial. Units are free-text (need normalization). No clean ACVPU field (only numeric `gcs`). |
| Entry points / queue                | **partial**               | `patient_intakes.status='triaged'` **exists but has no producer — triage IS the producer.** `priority_hint ∈ {routine,urgent,emergency}`. Greenfield: zero triage/acuity tables. Queue is FIFO `sequence_number` only.                                                                                                                                                                               |
| Cadre / RLS                         | **full**                  | `cadres.is_clinical=true` is the reusable clinical-staff gate (already excludes RECEPTION at the DB). Capability = code policy constant (ADR 0027/0030 precedent).                                                                                                                                                                                                                                   |
| Audit / encryption / MFA            | **full**                  | `sa_audit_log` + `recordSaAudit` ready; AES-256-GCM PHI helper present; AAL2 enforced in every scope guard.                                                                                                                                                                                                                                                                                          |
| Nurse/doctor workspaces             | **full**                  | `IncomingIntakesPanel` is **read-only** (clean slot for a triage action); `Sheet` pattern ready; `clinical_observations` is the natural vitals write-target.                                                                                                                                                                                                                                         |
| Scheduling / notifications / config | **partial → 1 scope gap** | `propose-urgent-appointment` exists (reuse). **Push/SMS notifications DO NOT EXIST** (only superadmin in-app `sa_notifications`). `triggered_by_alert_id` + monitoring alerts are **not in schema** (aspirational).                                                                                                                                                                                  |

**Two honest scope adjustments forced by the findings** (detail in §G):

1. **Red/Orange "push + SMS to receiving team" is not buildable as specified** — no push/SMS infra exists. Proposed: in-app clinical notification now (extend `sa_notifications` pattern to clinical staff), SMS/push behind a stubbed interface for a later infra build.
2. **"Carry the alerting vital from a monitoring alert" has nothing to consume** — no alert object exists. Proposed: triage auto-populates from the latest `clinical_observations` / `health_readings` instead; the alert-link seam is left clean for when monitoring-alerts land.

---

## A. Clinical model — the part needing your sign-off

### A.1 — Five-tier level / colour / target-time defaults (per research doc §1)

| Level | Colour     | Meaning                            | Default target time | Disposition area      |
| ----- | ---------- | ---------------------------------- | ------------------- | --------------------- |
| 1     | Red        | Immediate life-saving intervention | 0 min (now)         | Resus                 |
| 2     | Orange     | High risk / time-critical          | 10 min              | High-acuity           |
| 3     | Yellow     | Urgent, stable                     | 60 min              | Standard              |
| 4     | Green      | Less urgent                        | 120 min             | Standard / fast-track |
| 5     | Blue/White | Non-urgent                         | Routine             | Fast-track            |

Configurable per hospital; these are the safe defaults. **Sign-off needed:** confirm these five + times.

### A.2 — Discriminator list (SATS-style red-flags) → minimum acuity

This is **the most safety-critical list in the build** and is seeded from research doc §4/§5/§8. Each discriminator forces a _minimum_ acuity regardless of score (Step 3/4). Proposed seed (clinically reviewed reference data, extensible):

| Discriminator                                               | Min acuity | Source       |
| ----------------------------------------------------------- | ---------- | ------------ |
| Airway compromise / stridor                                 | Red (1)    | ESI-A / SATS |
| Absent or agonal breathing                                  | Red (1)    | Step 0       |
| No palpable pulse / cardiac arrest                          | Red (1)    | Step 0       |
| Unresponsive (U on ACVPU)                                   | Red (1)    | Step 0       |
| Active seizure                                              | Red (1)    | SATS         |
| Exsanguinating / uncontrolled haemorrhage                   | Red (1)    | SATS         |
| SpO₂ < 90% despite O₂                                       | Red (1)    | research §11 |
| Glucose < 3.0 mmol/L                                        | Red (1)    | research §6  |
| Cardiac-sounding chest pain                                 | Orange (2) | ESI-B        |
| Focal neuro deficit / suspected stroke                      | Orange (2) | research §6  |
| Sepsis suspicion + (qSOFA ≥2 OR NEWS2 ≥5)                   | Orange (2) | research §5  |
| Severe respiratory distress (high RR, working hard)         | Orange (2) | research §6  |
| Shock Index ≥ 1.0                                           | Orange (2) | research §6  |
| Obstetric: SBP ≥160 or DBP ≥110                             | Red (1)    | MEOWS §8     |
| Obstetric: seizure (eclampsia)                              | Red (1)    | MEOWS §8     |
| Obstetric: heavy PV bleeding                                | Red (1)    | MEOWS §8     |
| Obstetric: pre-eclampsia triad (headache+visual+epigastric) | Orange (2) | MEOWS §8     |
| Reduced fetal movements                                     | Orange (2) | MEOWS §8     |
| Paediatric: grunting / cyanosis / cap refill >3s            | Orange (2) | PEWS §7      |
| Paediatric: non-blanching rash                              | Red (1)    | PEWS §7      |
| Paediatric: infant <3 months, fever ≥38°C                   | Orange (2) | PEWS §7      |
| Severe pain (≥7/10)                                         | Yellow (3) | SATS/ESI     |

**Sign-off needed:** add/remove/re-rank any item. This list is the clinical heart of the engine.

### A.3 — Population routing rules (research doc §7/§8; mandatory)

- **Adult** (≥16y, not pregnant) → NEWS2.
- **Paediatric** (<12y **or** <150cm per SATS) → PEWS + age-banded norms.
- **Obstetric** (pregnant **or** ≤6 weeks postpartum) → MEOWS + obstetric discriminators.
- **Unknown pregnancy in a woman of reproductive age (≈12–50y)** → the engine **flags "confirm pregnancy status"** and does NOT assume; until confirmed it runs adult NEWS2 **but** surfaces the flag so the clinician resolves it. **Sign-off needed:** confirm this default (adult-with-flag vs block-until-confirmed).
- Age 12–15: research doc puts SATS paediatric cutoff at <12y but NEWS2 at ≥16y — a 3-year seam. **Proposed:** 12–15y routes to **paediatric PEWS** (the safer, more sensitive choice). **Sign-off needed.**

### A.4 — Override authority by cadre (kickoff §3; policy constant, not DB table)

Proposed policy (code constant, reviewed, per ADR 0027/0030 precedent):

| Cadre                    | May triage?  | May override UP | May override DOWN |
| ------------------------ | ------------ | --------------- | ----------------- |
| NURSE, MIDWIFE           | yes          | yes             | yes (with reason) |
| DOCTOR, CLINICAL_OFFICER | yes          | yes             | yes (with reason) |
| RECEPTION (non-clinical) | **never**    | never           | never             |
| PHARMACIST, LAB_TECH     | no (default) | —               | —                 |

Every override (up or down) requires a logged reason; computed-vs-assigned recorded. **Sign-off needed:** in particular — _should down-triage be restricted to doctors/clinical-officers only_ (a common safety policy), or may nurses down-triage too? This is the single highest-stakes authority question.

### A.5 — Baseline-adjustment rules (research doc §0; clinician-gated)

For chronically-abnormal-baseline patients (TB/HIV burden), a clinician may apply a **reasoned, audited baseline adjustment** that tempers over-triage — but it can **never** pull below (a) a Step-0 life-threat or (b) a triggered red-flag discriminator. The system never auto-tempers; baseline adjustment is always an explicit clinician action with a reason. **Sign-off needed:** confirm the floor (life-threat + discriminator) is correct and absolute.

### A.6 — The ACVPU gap (clinical decision)

NEWS2 scores **consciousness as ACVPU** (Alert / new-Confusion / Voice / Pain / Unresponsive). The DB has only numeric `gcs`. Two options:

- **(a) Add ACVPU as a first-class triage input** (new `observation_type='acvpu'` value, captured at triage) — cleaner, matches NEWS2 exactly.
- **(b) Derive ACVPU from GCS** (GCS 15 = Alert; <15 = at least C/V/P/U) — reuses existing data but loses the "new confusion" nuance.
  **Proposed: (a)** — capture ACVPU directly at triage; it's the validated input and the "new confusion" distinction is clinically load-bearing for NEWS2's +3. **Sign-off needed.**

---

## B. Schema proposal (migration 0036, additive only)

Net-new (greenfield confirmed — no existing triage objects):

1. **`triage_records`** — the medico-legal record (one per triage event):
   - `id`, `intake_id` (FK → patient_intakes), `patient_user_id`, `hospital_id`, `department_id`
   - `ruleset` (`adult_news2` | `paediatric_pews` | `obstetric_meows`)
   - `vitals_snapshot` (jsonb — the exact inputs used, timestamped)
   - `computed_level` (1–5), `computed_score` (int), `computed_breakdown` (jsonb — every parameter's contribution + derived metrics + which discriminators fired)
   - `assigned_level` (1–5 — after clinician confirm/override), `override_reason` (text, nullable), `override_direction` (`up`|`down`|`none`)
   - `baseline_adjusted` (bool), `baseline_reason` (text, nullable)
   - `life_threat_fast_tracked` (bool — Step 0 bypass)
   - `provisional` (bool — true if vitals incomplete)
   - `triaged_by_user_id`, `triaged_at`, `created_at`
   - RLS: the **verbatim `cadres.is_clinical=true` clinical-staff predicate** from migration 0033 + patient-owns-own-read + superadmin. Reception excluded at the DB.

2. **`triage_discriminators`** — reference data (the §A.2 list): `code`, `label`, `min_acuity_level`, `applies_to` (`all`|`adult`|`paediatric`|`obstetric`), `sort_order`, `active`. Seeded from §A.2; extensible; clinically reviewed; changes audited + CSO-gated.

3. **`triage_config`** (per hospital, optional — follows `department_scheduling_policy` shape): `hospital_id`, level target-times, threshold overrides (jsonb). Safe validated defaults when absent.

4. **`patient_intakes`** — add denormalized `triage_level` (int, nullable) + `triaged_at` for board sorting (the full record lives in `triage_records`; this is the cheap acuity-ordering key the queue needs).

5. **`clinical_observations`** — add `'acvpu'` to the `observation_type` CHECK (per §A.6a) + optional `triage_record_id` link so triage-captured vitals are distinguishable from routine obs.

6. **`sa_audit_log`** — widen `action` CHECK with `compute_triage`, `assign_triage`, `override_triage`, `adjust_triage_baseline`; widen `target_kind` with `triage_record`. Additive.

No shipped migration altered. All `ADD COLUMN IF NOT EXISTS` / CHECK-widen patterns matching 0033–0035.

---

## C. The deterministic scoring core (GATE B preview)

A pure, side-effect-free TypeScript module `lib/triage/scoring/` with thresholds as explicit constants transcribed from the research doc tables, **unit-tested at every boundary value**. No DB, no time, no randomness — same inputs always produce the same output. Shared by the app (server actions) and, if needed, an edge function. This is what makes triage medico-legally reproducible.

---

## D. Reuse vs stub decisions

| Thing                   | Decision                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| Vitals store            | **Reuse** `clinical_observations` (has all params) + `health_readings` for home trend                  |
| Worklist query          | **Reuse/extend** `fetchHospitalIncomingIntakes` (filter `status='awaiting_triage'`)                    |
| Triage panel container  | **Reuse** `components/ui/sheet.tsx`                                                                    |
| Incoming panel          | **Extend** `IncomingIntakesPanel` with a triage action (clinical workspaces only; reception unchanged) |
| Cadre guard             | **New** `lib/triage/scope.ts` composed from existing nurse/doctor scope pattern                        |
| Audit                   | **Reuse** `recordSaAudit`                                                                              |
| Urgent appointment seam | **Reuse** `propose-urgent-appointment`                                                                 |
| Push/SMS notifications  | **Stub** behind an interface; ship in-app clinical notification (see §G)                               |
| Monitoring alert carry  | **Stub/defer** — auto-populate from latest observations instead (see §G)                               |

---

## E. Who triages (cadre scope)

`lib/triage/scope.ts` admits clinical cadres only (NURSE, MIDWIFE, DOCTOR, CLINICAL_OFFICER), AAL2-gated, per §A.4. RECEPTION is excluded both in the guard **and** at the DB (RLS). Triage worklist lives at `/nurse/triage` (and reachable from the doctor workspace where policy allows).

---

## F. Build order (gates B–F) — unchanged from kickoff §7

B: deterministic scoring core (pure, unit-tested). C: engine flow Steps 0–6. D: override + triage UI. E: integrations + routing. F: closeout + regression + CSO sign-off. Each stops for review.

---

## G. The two scope gaps that need a decision now

### G.1 — Notifications (kickoff §4 wants Red/Orange → push + SMS)

**Reality:** no push or SMS infrastructure exists. Only superadmin in-app `sa_notifications`.
**Proposed:** Build an **in-app clinical notification** for Red/Orange (extend the `sa_notifications` pattern to clinical staff at the receiving department) now; put **SMS/push behind a typed interface** that no-ops with a logged TODO until a dedicated notification-infra build. The triage engine calls the interface; swapping in a real SMS gateway later needs no triage change.
**Decision needed:** accept in-app-now + stubbed-SMS, or treat SMS/push as a hard blocker?

### G.2 — Monitoring-alert vital carry (kickoff §4)

**Reality:** no alert object / `triggered_by_alert_id` exists anywhere.
**Proposed:** triage **auto-populates the vital set from the latest `clinical_observations` + `health_readings`** for the patient (still requiring a fresh confirmed set), and we leave a clean seam for a future `triggered_by_alert_id`. No fabricated alert.
**Decision needed:** accept auto-populate-from-latest, or hold the trend feature until monitoring-alerts exist?

---

## H. What I will NOT do without sign-off

- Build any scoring (B) before you ratify the §A.2 discriminator list + §A.4 override authority.
- Apply migration 0036 before schema (§B) is approved.
- Ship anything that could under-triage silently. Every default biases up.

---

## Decisions requested (the clinical sign-off)

1. **§A.1** five-tier times — confirm defaults?
2. **§A.2** discriminator list — add / remove / re-rank?
3. **§A.3** unknown-pregnancy default (adult-with-flag) + 12–15y → paediatric?
4. **§A.4** override authority — **may nurses down-triage, or doctors/COs only?**
5. **§A.5** baseline-adjustment floor (life-threat + discriminator, absolute) — correct?
6. **§A.6** ACVPU as a new captured input — agree?
7. **§G.1 / §G.2** the two scope gaps — accept the proposed approach?
