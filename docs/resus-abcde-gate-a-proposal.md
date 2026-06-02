# ABCDE Resuscitation Surface — GATE A proposal (clinical sign-off)

**Status:** ⛔ **DRAFT — awaiting CSO (Fadhul) sign-off. Nothing in GATE B–F is built, and no dose constant lands in code, until §A is signed.**
**Branch:** `feat/resus-abcde` (not yet cut — this doc precedes code)
**Scope (Option A):** the ABCDE primary-assessment engine (each step's assessment paired with guideline-linked actions) + continuous monitoring throughout + team mobilisation. **The full cardiac-arrest ALS algorithm is the NEXT module** — this surface only _detects_ arrest and _routes_ to it (stub).
**Clinical source:** [`resuscitation-abcde-clinical-reference.md`](../resuscitation-abcde-clinical-reference.md) (authoritative medicine) + the web-verification pass below.
**This gate is a clinical sign-off, not just technical.** The assessment→action mappings and the dose constants are a clinical-safety artifact.

> **Honesty posture — "never ship a remembered dose."** Every dose/threshold in §A.3 was checked against a primary/authoritative source via web search on **2026-06-01**. Each carries a **confidence** tag. Anything not web-verified is listed in §G (unverified flags) and is **not** proposed as a code constant. Every schema/identifier claim in §C–§E was verified against the codebase by a read-only precondition sweep — where the kickoff assumed something that doesn't exist, it's flagged in §F rather than papered over.

---

## Preface — verified precondition state (reuse vs stub)

| Precondition                               | State       | Verified reality (exact identifiers)                                                                                                                                                                                                                                                                                                                                                               | Decision                                                                                                                                    |
| ------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Resus/L1 trigger**                       | **usable**  | `rapidRedAction` ([`app/nurse/triage/actions.ts`](../app/nurse/triage/actions.ts)) creates a `triage_records` row with `computed_level=1`, `assigned_level=1`, `life_threat_fast_tracked=true`; marks `patient_intakes.status='triaged'`; audits `assign_triage`. The "Resus" button is [`rapid-red-button.tsx`](../app/nurse/triage/_components/rapid-red-button.tsx) with 7 life-threat reasons. | **REUSE** as the surface's open-trigger. A resus episode keys off `triage_records.id` where `assigned_level=1`.                             |
| **Notifications (in-app)**                 | **usable**  | `notifyTriageOutcome` ([`lib/triage/notify.ts`](../lib/triage/notify.ts)) writes `sa_notifications` rows (`kind='clinical_triage_alert'`, mig 0037) to clinical staff at the receiving department, discovered via `staffAffiliations` (`state ∈ {active,approved}`) ⋈ `cadres.isClinical=true`.                                                                                                    | **REUSE** for team mobilisation in-app alerts.                                                                                              |
| **Notifications (SMS/push)**               | **stubbed** | `stubbedNotificationSink.sendUrgent()` logs intent, never dispatches. Same pattern triage already ships.                                                                                                                                                                                                                                                                                           | **STUB** behind the existing `NotificationSink` interface; in-app rows are real now, dispatch lands with a real gateway. Flagged.           |
| **Vitals / monitoring**                    | **partial** | `clinical_observations` (mig 0031, EAV) records `observation_kind ∈ {bp,hr,temperature,rr,spo2,glucose,pain,weight,height,intake,output,gcs,other,acvpu}` with `numeric_value_1/2`, `unit`, `triage_record_id`, `encounter_id`. `fetchRecentVitals` ([`lib/triage/worklist.ts`](../lib/triage/worklist.ts)) reads 14-day history. **No continuous device streaming, no EtCO₂/urine-output kinds.** | **REUSE** for manual timed vitals + trend. **STUB** continuous device feed + add new kinds (etco2, urine_output) at GATE D. Flagged.        |
| **Encounter link**                         | **usable**  | `encounters` ([`db/schema/scheduling.ts`](../db/schema/scheduling.ts), `state ∈ {in_progress,completed,cancelled}`), created/closed by `ha-start-encounter` / `ha-complete-encounter`. A walk-in rapid-Red has **no** encounter initially.                                                                                                                                                         | **REUSE** the FK seam; resus episode links to an encounter when one exists, otherwise stands alone and can be linked on admission.          |
| **Cadre / authority**                      | **full**    | `cadres.isClinical`; `staffAffiliations`; `resolveTriageAuthority` ([`lib/triage/authority.ts`](../lib/triage/authority.ts)) rides `clinical_cosign_policies(action_kind, requirement∈{allowed,cosign_required,blocked})`. Scope guard `requireTriageScope` exposes `cadreCode`/`authority`.                                                                                                       | **REUSE** for role-by-cadre (§D) via a new `action_kind`.                                                                                   |
| **Ward-in-charge**                         | **usable**  | `wardInChargeAssignments` ([`db/schema/nurse-workspace.ts`](../db/schema/nurse-workspace.ts)) — one active per ward (`endsAt IS NULL`).                                                                                                                                                                                                                                                            | **REUSE** to explicitly alert the in-charge.                                                                                                |
| **On-shift / on-duty presence**            | **absent**  | No `staff_presence` table, no shift/duty model. Presence is only _inferred_ from active affiliations + active assignments.                                                                                                                                                                                                                                                                         | **STUB** — mobilise _all active clinical staff at the department + ward-in-charge_; true on-shift filtering is a later refinement. Flagged. |
| **Audit / append-only / encryption / RLS** | **full**    | `sa_audit_log` + `recordSaAudit({actorId,action,targetKind,targetId,reason≥8,…})` (append-only, REVOKE UPDATE/DELETE); AES-256-GCM `encrypt()/decrypt()` ([`lib/encryption.ts`](../lib/encryption.ts)); RLS on every clinical table.                                                                                                                                                               | **REUSE** the pattern verbatim for the immutable resus timeline.                                                                            |
| **Migrations**                             | n/a         | Latest on disk = `0037_triage_notifications.sql`.                                                                                                                                                                                                                                                                                                                                                  | New additive migration = **`0038_resus_abcde.sql`** (GATE B).                                                                               |
| **Design tokens / shell**                  | **full**    | [`DESIGN-medsync.md`](../DESIGN-medsync.md); teal-600 actions, red = critical only, mono numerals, `cubic-bezier(0.16,1,0.3,1)`. Hard UI rule in effect: **no left-edge accent bars** on cards/tiles.                                                                                                                                                                                              | **REUSE** tokens; resus is high-acuity so red is _purposeful_, not everywhere.                                                              |

---

## A. Clinical model — needs your sign-off (the heart of this gate)

### A.1 — The four governing principles (enforced by the UX)

1. **Strict sequence A→B→C→D→E** — assess in order.
2. **Treat before proceeding** — correct each life-threat before the next letter.
3. **Reassess after every intervention** — return to A and work down; any deterioration restarts at A.
4. **Call for help early** — Red/L1 / Step-0 fires team mobilisation (§D).

UX consequences (proposed): a persistent **open-life-threats tracker** (which letters have an open vs addressed life-threat), a one-tap **"Return to A"** always visible, a **post-intervention reassessment prompt** after every logged action, and rapid access to any letter while _visibly tracking_ sequence state. **Sign-off needed:** confirm these four are the enforced discipline.

### A.2 — ABCDE assessment→action mappings (condensed; full detail in the appendix object)

Each step = **assess** (look/listen/feel/measure) → **danger signs** → **linked actions** (tap logs to the timeline, _recorded as performed by the clinician — never executed by the app_) → **reassess trigger**. Sources are per-action in §A.5/appendix.

| Step                | Key assessment                                                                                                                                                                                       | Headline danger signs                                                                                                                                                     | Linked actions (category-level unless dose-tagged)                                                                                                                                                                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A — Airway**      | look (see-saw, cyanosis-late, FB/vomit), listen (stridor/gurgling/snoring/wheeze/silence), feel airflow, the _talking patient_                                                                       | complete obstruction, stridor, progressive swelling (angioedema/burns/anaphylaxis), GCS≤8 can't protect, soiled airway                                                    | head-tilt/chin-lift **or** jaw-thrust (C-spine), suction, OPA/NPA, O₂ 15 L/min reservoir, recovery position, escalate to advanced airway (call anaesthetics early), **anaphylaxis→IM adrenaline 💉**, C-spine immobilisation                                                                                                               |
| **B — Breathing**   | RR (full minute), SpO₂ + inspired O₂, effort, expansion/symmetry, trachea, percussion, auscultation, EtCO₂                                                                                           | RR ≥25 or ≤8, SpO₂<92% (<88% type-2) despite O₂, silent chest, tension pneumothorax triad, tiring/apnoea                                                                  | high-conc O₂ (titrate to target), **tension pneumothorax→needle/finger decompression then drain** (clinical dx, don't wait for imaging), nebulised bronchodilator 💉(cat), nebulised adrenaline for _upper-airway_ oedema, **anaphylaxis→IM adrenaline 💉**, sit up / pulmonary-oedema support, assisted ventilation (BVM) + call for help |
| **C — Circulation** | cap refill, pulse (central vs peripheral), HR, BP+MAP, **shock index HR/SBP (>0.9 occult, ≥1.0 high-risk)**, pulse pressure, 12-lead ECG, lactate, "on the floor and four more"                      | SBP≤90, HR≥131 or ≤40, compensated/occult shock, tamponade (Beck's triad), major haemorrhage, rising lactate                                                              | 2× large-bore IV / IO, bloods at access, balanced crystalloid bolus + **reassess each bolus**, haemorrhage control, **TXA in trauma 💉** (time-critical <3 h), major-haemorrhage protocol, **sepsis bundle 💉** (cultures→abx→≥30 mL/kg, MAP≥65), STEMI→PCI, **anaphylaxis→IM adrenaline 💉**, tamponade→pericardiocentesis (senior)       |
| **D — Disability**  | ACVPU **or** GCS, **GCS≤8→back to A**, pupils, **"Don't Ever Forget Glucose" (CBG <4.0)**, lateralising signs, seizure, causes (re-check A/B/C first)                                                | GCS≤8/falling, new focal deficit, unequal/fixed pupils, **Cushing's response** (HTN+bradycardia+irregular breathing), status epilepticus, hypoglycaemia, opioid toxidrome | correct A/B/C first, **hypoglycaemia→IV glucose / IM glucagon / oral CHO 💉**, **seizure→benzodiazepine first-line 💉(cat)** + status pathway, raised ICP→senior/neurosurg + head-up, **naloxone (titrate to ventilation) 💉(cat)**, flumazenil (caution, _not routine_), urgent CT head                                                   |
| **E — Exposure**    | full exposure (dignity/heat), rashes (**non-blanching→meningococcal**; urticaria→anaphylaxis), wounds/bruising, abdomen/back log-roll, **core temp** (hypothermia <35 / hyperpyrexia), AMPLE history | non-blanching rash, anaphylaxis features, hypo/hyperthermia, occult bleeding, peritonitis, limb ischaemia, ?AAA                                                           | **anaphylaxis→IM adrenaline 💉** + adjuncts (O₂/fluids/position; **no routine steroids — 2025**), meningococcal→sepsis pathway, active warming/cooling, haemorrhage/surgical control, cover for dignity, AMPLE + escalate to definitive care                                                                                               |

💉 = carries a dose (see §A.3). 💉(cat) = drug action but **category-level only**, no fixed mg on this surface.

**Cross-cutting:** rescuer safety first; general impression ("looks sick/well"); O₂ for any critically ill patient; continuous monitoring attached early; IV access early; SBAR/RSVP handover; everything timestamped.

### A.3 — Dose-currency table (web-verified 2026-06-01; confidence-tagged) ⚠️ **the clinical-safety core**

**TIER 1 — fixed cited code constants (web-verified; propose to ship as hard constants):**

| #   | Constant                                   | Value (adult)                                                                                                       | Source                                                                                                                                       | Confidence                                                  |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | `ANAPHYLAXIS_ADRENALINE_ADULT_IM`          | **500 µg (0.5 mg) = 0.5 mL of 1:1000**, IM anterolateral mid-thigh; **repeat every 5 min** if no improvement        | RCUK Anaphylaxis guidance **concurrent with ERC Guidelines 2025** Special Circumstances ("0.5 mg IM, repeat if no improvement within 5 min") | **verified-web** (current 2025 cycle, not just legacy 2021) |
| 2   | `HYPOGLYCAEMIA_IV_GLUCOSE_ADULT`           | **75 mL of 20%** glucose **OR 150 mL of 10%** IV over 10–15 min; recheck CBG, repeat if <4.0                        | JBDS-IP Jan 2023 (50% glucose no longer recommended)                                                                                         | **verified-web**                                            |
| 3   | `HYPOGLYCAEMIA_GLUCAGON_ADULT_IM`          | **1 mg IM** (no IV access; one dose; ineffective if glycogen-depleted)                                              | JBDS-IP Jan 2023 / BNF / GlucaGen HypoKit SmPC                                                                                               | **verified-web**                                            |
| 4   | `HYPOGLYCAEMIA_ORAL_CHO_ADULT`             | **15–20 g** quick-acting CHO; re-test 10–15 min, up to 3×; then 20 g long-acting                                    | JBDS-IP Jan 2023                                                                                                                             | **verified-web**                                            |
| 5   | `OXYGEN_CRITICALLY_ILL`                    | **15 L/min** non-rebreathe reservoir; target SpO₂ **94–98%** (**88–92%** if hypercapnic/type-2 RF risk pending ABG) | BTS Oxygen 2017                                                                                                                              | **verified-web**                                            |
| 6   | `SEPSIS_CRYSTALLOID` / `SEPSIS_MAP_TARGET` | **≥30 mL/kg** balanced crystalloid in first 3 h _(weak rec)_; **MAP ≥65 mmHg** on vasopressors _(strong rec)_       | Surviving Sepsis Campaign 2021                                                                                                               | **verified-web** (carries weak/strong grading)              |

**TIER 1b — verified value, CSO decides encode vs protocol-surfaced:**

| #   | Item         | Value                                                                                                    | Recommendation                                                                                                                                | Confidence                                                                   |
| --- | ------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 7   | `TXA_TRAUMA` | Within **3 h** of injury (best <1 h; **harm if >3 h**); regimen **1 g IV over 10 min then 1 g over 8 h** | **Hard-code the _timing_ prompt** as the fixed fact; **surface the _dose_ from the local major-haemorrhage protocol** rather than hard-coding | regimen+timing **verified-web** (CRASH-2/CRASH-3); encode-choice = needs-CSO |

**TIER 2 — category-level only (no fixed mg on this surface; action class verified):**

| #   | Item                     | Surface prompt                                                                        | Note                                                                                                                                                    | Confidence                                   |
| --- | ------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 8   | Seizure/status           | "benzodiazepine first-line + status pathway"                                          | agent verified (IV lorazepam first-line; buccal midazolam / rectal diazepam if no IV — NICE NG217, updated Jan 2025); **specific mg NOT web-confirmed** | category verified-web; **mg = needs-CSO**    |
| 9   | Naloxone                 | "titrate to adequate ventilation, NOT to full arousal; repeat/infusion may be needed" | support ventilation first (a B emergency); IM ampoule 400 µg; IV initial titration source-variable                                                      | principle verified-web; **dose = needs-CSO** |
| 10  | Nebulised bronchodilator | "O₂-driven neb ± ipratropium ± steroid, per cause"                                    | adjunct only in anaphylaxis, never replaces IM adrenaline                                                                                               | category; **mg = needs-CSO**                 |
| 11  | Flumazenil               | **caution flag, NOT a routine action**                                                | avoid in mixed/unknown overdose (seizure/arrhythmia risk); senior/toxicology only                                                                       | by design no surface dose                    |

**PAEDIATRICS (all letters):** every paediatric dose is weight/age-banded and **out of scope for an adult constant**. Adrenaline IM age-bands (>12 yr 500 µg; 6–12 yr 300 µg; 6 mo–6 yr 150 µg; <6 mo 100–150 µg per BNFc) were **not independently web-verified this pass → needs-CSO**. Never display a single paediatric number; display banded or defer.

### A.4 — Anaphylaxis cross-cut (A/B/C/E — one entity, same first-line action)

Encode anaphylaxis as **one cross-cutting protocol object** referenced from A/B/C/E (single source of truth for the 0.5 mg constant + 5-min repeat + "2 doses → refractory" logic), not four divergent copies.

- **A:** laryngeal/airway swelling, stridor → IM adrenaline + airway escalation.
- **B:** wheeze/stridor/distress → IM adrenaline; nebulised bronchodilator _adjunct only_; _nebulised_ adrenaline (upper-airway oedema) is a **different** thing from systemic IM adrenaline — disambiguate in UI.
- **C:** distributive shock/hypotension → IM adrenaline + early IV crystalloid; flat + legs up if hypotensive.
- **E:** urticaria/angioedema on the sweep — often _where it's first recognised_ → IM adrenaline immediately.
- **Adjuncts (verified, category-level):** remove trigger; high-flow O₂; positioning; early IV crystalloid (volume clinician-titrated); neb bronchodilator for wheeze. **2025: routine corticosteroids NO LONGER recommended — surface must NOT prompt steroids as a core step.**
- **Refractory:** no improvement after 2 IM doses → IV adrenaline **infusion by experienced clinicians only** + senior/ICU. **Infusion rate is DEFERRED / needs-CSO — no infusion number on this surface.** Watch for biphasic reactions.

### A.5 — Arrest-detection → stub seam (the ONLY arrest logic in scope)

- **Detection (fires at any letter):** patient **unresponsive** AND **not breathing normally** (apnoea or **agonal gasps — gasping is NOT normal breathing**) and/or **no central pulse / no signs of life**.
- **What the stub does, and only this:** (1) surface an unmistakable top-priority **"Start CPR"** prompt (begin compressions / call resus team / get defibrillator) — a _prompt_, the app records the team starting CPR, it does not direct it; (2) **route/handoff to the ALS arrest module** (navigation seam) and **timestamp** the transition (time arrest detected, time CPR prompt shown); (3) **stop the current ABCDE flow** for that patient ("if pulse is lost, exit to CPR/ALS module").
- **Hard boundary — DEFERRED to the ALS module (built nothing here):** rhythm assessment (shockable/non-shockable), defibrillation/energy, CPR rate/depth/ratio logic, **all arrest drug dosing** (adrenaline-in-arrest, amiodarone), 4Hs/4Ts. Build the boundary as a single hand-off interface the ALS module later owns. Peri-arrest arrhythmias: flagged from C/ECG, full algorithm later.

---

## B. Immutable resus record — what GATE B must prove

Mirror the triage/audit immutability pattern exactly: **append-only, timestamped, versioned**; corrections create new rows (`supersedes_event_id`), nothing silently edited/deleted; reconstructable second-by-second for the debrief + medico-legal record; PHI-encrypted narrative; full audit on every write; links to encounter + patient; exportable as a resus summary. Distinguish **clinical time** (`recorded_at`, when it happened at the bedside) from **system time** (`created_at`, when the row was written).

---

## C. Schema proposal (for review — built at GATE B, migration `0038_resus_abcde.sql`)

> Proposal only. Names/columns are for your review; nothing is created until §A is signed and GATE B is reached.

**`resus_episodes`** — one per resus activation.
`id` (uuid pk) · `hospital_id` (fk) · `department_id` (fk) · `triage_record_id` (fk → `triage_records`, the trigger) · `patient_user_id` (fk) · `encounter_id` (fk → `encounters`, nullable) · `trigger_kind` (`triage_red` | `step0_life_threat` | `in_resus_deterioration`) · `trigger_reason` (text) · `started_at` · `ended_at` (nullable) · `state` (`active` | `concluded` | `cancelled`) · `disposition` (`theatre` | `icu` | `cath_lab` | `ward` | `mortuary` | `transferred` | nullable) · `outcome` (text, nullable) · `arrest_detected_at` (nullable; set when the §A.5 seam fires) · timestamps.

**`resus_timeline_events`** — the append-only immutable timeline.
`id` (uuid pk) · `resus_episode_id` (fk) · `event_kind` (`assessment` | `action` | `drug` | `fluid` | `procedure` | `vital` | `decision` | `role_change` | `mobilisation` | `reassessment` | `arrest_detected` | `cpr_started` | `handover` | `note`) · `abcde_step` (`pre` | `A` | `B` | `C` | `D` | `E` | `arrest` | nullable) · `recorded_by_user_id` (fk — who performed/recorded it) · `recorded_at` (clinical time) · `created_at` (system time) · `payload` (jsonb — structured detail: for `drug` → `{name, dose, route, dose_source_ref}`; for `vital` → `{kind, value1, value2, unit}`; etc.) · `narrative_encrypted` (text, nullable, AES-256-GCM) · `supersedes_event_id` (fk → self, nullable; corrections) · `state` (`active` | `superseded`). **REVOKE UPDATE/DELETE; correction = new row.**

**`resus_role_assignments`** — who holds which role over time.
`id` (uuid pk) · `resus_episode_id` (fk) · `user_id` (fk) · `role` (`leader` | `airway` | `circulation` | `scribe` | `runner` | `cpr_provider` | `family_liaison`) · `assigned_at` · `ended_at` (nullable) · `assigned_by_user_id` (fk). (Append role _changes_ as rows; current roster = rows where `ended_at IS NULL`.)

**`resus_mobilisation_alerts`** — the team-call + the "who's responding" shared view.
`id` (uuid pk) · `resus_episode_id` (fk) · `recipient_user_id` (fk) · `channel` (`in_app` | `sms` | `push`) · `sa_notification_id` (fk → `sa_notifications`, for the in-app row) · `sent_at` · `delivered_at` (nullable) · `acknowledged_at` (nullable) · `responding` (bool, default false). (In-app row is real now via `sa_notifications`; sms/push rows record _intent_ until the dispatcher lands.)

**RLS:** clinical staff at the hospital + the patient's resus team + superadmin (mirror `triage_records`' policy). **Audit:** `recordSaAudit` on every write (`targetKind='resus_episode' | 'resus_timeline_event'`). **Encryption:** `narrative_encrypted` only.

---

## D. Team mobilisation roster + role-by-cadre (proposal — needs sign-off)

**D.1 — Who is alerted (mobilisation roster).** Reuse `notifyTriageOutcome`'s discovery (active/approved `staffAffiliations` ⋈ `cadres.isClinical=true` at the receiving department), **plus** the active **ward-in-charge** explicitly. Because no true on-shift/on-duty model exists, the proposed v1 roster = **all active clinical staff at the department + ward-in-charge**, in-app now / SMS+push stubbed. Per-hospital configurable resus-team rosters and on-shift filtering are later refinements (flagged). **Sign-off needed:** is "all active clinical dept staff + ward-in-charge" the right v1 net, or should it be narrower (e.g. doctors + ward-in-charge only)?

**D.2 — Role-by-cadre.** In a resus, speed + the record dominate. Proposed: **role assignment is open** (any responder can take any role so the team isn't blocked), with **recommended defaults by cadre** (leader → doctor/senior; scribe → nurse; airway → most skilled present; circulation/access → nurse/clinical officer; runner → any), and **the `leader` role gated to doctor / senior clinical-officer cadre** via a new `clinical_cosign_policies.action_kind='resus_lead'` (`allowed` for doctor/CO, others `cosign_required` or open per your call). Every role assignment is logged (who, when). **Sign-off needed:** (a) gate `leader` to doctor/CO, or leave fully open with a recommendation? (b) confirm the role set {leader, airway, circulation, scribe, runner, cpr_provider, family_liaison}.

---

## E. Engine reuse-vs-stub summary (what's real day one)

| Capability                            | Day-one behaviour                                                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Open on Resus/L1/Step-0               | **Real** — keys off `triage_records.assigned_level=1`                                                                               |
| Team mobilisation (in-app)            | **Real** — `sa_notifications` to dept clinical staff + ward-in-charge                                                               |
| Team mobilisation (SMS/push)          | **Stub** — intent logged behind `NotificationSink`; rows recorded                                                                   |
| ABCDE assess→action + timeline        | **Real** (GATE C) — logs to `resus_timeline_events`                                                                                 |
| Continuous vitals + trend             | **Partial** — manual timed vitals via `clinical_observations` + trend (GATE D); device streaming + EtCO₂/urine-output kinds stubbed |
| Shared live view ("who's responding") | **Real-ish** — from `resus_role_assignments` + `resus_mobilisation_alerts.acknowledged_at`; live refresh strategy TBD at GATE E     |
| Encounter link                        | **Real** when an encounter exists; otherwise linkable later                                                                         |
| Arrest                                | **Detect → CPR prompt → route + timestamp** only; ALS logic deferred                                                                |

---

## F. Honest gaps vs the kickoff's assumed preconditions

1. **"monitoring/vitals engine (continuous)"** — only point-in-time `clinical_observations` exists; no continuous/device streaming, no EtCO₂/urine-output kinds. We build against the manual interface + add kinds; device feed is stubbed. **Flagged.**
2. **"notifications (push + SMS)"** — only in-app `sa_notifications` is real; SMS/push is a logged stub (same as triage). **Flagged.**
3. **"on-shift/on-duty staff"** — no presence/shift model; mobilisation uses active affiliations + ward-in-charge as the proxy. **Flagged.**
4. **"encounter engine"** — exists, but a walk-in rapid-Red has no encounter at trigger time; link is optional/deferred. **Flagged.**

---

## G. Unverified flags — every value needing CSO verification at build

(Consolidated from the web-verification pass; none of these are proposed as code constants until you clear them.)

1. **TXA dose as a hard-coded constant** — regimen + <3 h window are web-verified (CRASH-2/CRASH-3); the _encode-vs-protocol-surface_ choice is yours. **needs-CSO.**
2. **Status-epilepticus specific benzodiazepine mg** (e.g. lorazepam 4 mg / buccal midazolam 10 mg) — only the _category_ (NICE NG217 Jan 2025) was web-verified. **needs-CSO.**
3. **Naloxone specific starting dose / IV titration** — principle verified; specific bolus source-variable. **needs-CSO.**
4. **Nebulised bronchodilator specific doses** (salbutamol 5 mg, ipratropium 0.5 mg, steroid) — BTS/SIGN reference, not independently web-verified this pass; asthma-pathway-specific, not an ABCDE-surface constant. **needs-CSO.**
5. **Flumazenil** — intentionally no dose (caution-only); confirm the surface shows caution, not a number. **needs-CSO sign-off that no dose appears.**
6. **Buccal 40% glucose gel exact tube count** (~1.5–2 tubes / ~10 g CHO each) — from JBDS-derived sources, not the primary PDF. **needs-CSO.**
7. **Refractory-anaphylaxis IV adrenaline infusion rate** — deferred; not asserted. **needs-CSO (likely specialist-only).**
8. **ALL paediatric doses** (adrenaline IM bands; weight-based glucose; glucagon 500 µg <8 yr/<25 kg vs 1 mg; paeds TXA 15 mg/kg; paeds naloxone/benzo µg/kg) — banded by design, not web-verified here. **needs-CSO at build.**
9. **JBDS primary-PDF cross-check** — the JBDS_01 Jan 2023 PDF wasn't machine-readable; the 75 mL 20% / 150 mL 10%, glucagon 1 mg, oral 15–20 g values were verified via a faithful JBDS-derived NHS guideline + BNF/SmPC concordance. **Recommend a CSO eyeball against the JBDS primary PDF.**
10. **ATLS tension-pneumothorax site/needle-length** (4th/5th ICS anterior to axillary line; ≥5 cm/8 cm) — current ATLS-era guidance but edition-dependent; confirm against the governing local trauma protocol/ATLS edition before display (it's guidance text, **not** a dose constant). **needs-CSO.**
11. **Anaphylaxis adjunct IV fluid volume** (RCEMLearning cites 500–1000 mL) — kept clinician-titrated; not a fixed constant. **needs-CSO if any number is surfaced.**

---

## H. Open questions for the CSO (decisions that change the build)

1. **TXA encode-vs-surface:** hard-code 1 g/10 min then 1 g/8 h, or display only the timing prompt and pull the dose from the major-haemorrhage pack? _(Recommendation: timing hard-coded, dose protocol-surfaced.)_
2. **Status benzodiazepine:** confirm exact MedSync-formulary mg, or keep category-level ("benzodiazepine first-line + status pathway")?
3. **Naloxone:** confirm a starting dose/titration to display, or keep purely "titrate to ventilation"?
4. **Buccal glucose gel:** confirm exact tube count against JBDS primary text before showing a number.
5. **Oxygen target band:** show both bands with a hypercapnic-risk toggle, or default 94–98% + explicit at-risk flag? Confirm Venturi/ABG prompt copy.
6. **Tension-pneumothorax parameters:** display ATLS site/needle-length as on-screen text? Which ATLS edition / local trauma protocol governs?
7. **Refractory anaphylaxis:** confirm IV adrenaline infusion stays deferred (no rate on surface).
8. **Paediatrics:** confirm all paediatric doses display _banded_, sourced from BNFc/APLS/RCPCH, none reused from adult constants — and who owns that verification.
9. **C-spine vs airway precedence (RCUK Dec 2025):** confirm UI wording that airway patency takes precedence over strict immobilisation (jaw thrust where spinal injury suspected).
10. **Sepsis grading:** confirm the surface carries SSC 2021 grading (30 mL/kg = weak; MAP≥65 = strong) and supports reassessment between boluses rather than presenting 30 mL/kg as mandatory.
11. **Arrest seam copy:** confirm exact "Start CPR" wording, the agonal-gasp caveat, and the ALS-module route target/timestamp fields.
12. **Mobilisation roster (§D.1):** "all active clinical dept staff + ward-in-charge" v1, or narrower?
13. **Role-by-cadre (§D.2):** gate `leader` to doctor/CO or leave open with a recommendation? Confirm the role set.

---

## I. Build order after sign-off (each gate stops)

- **GATE B** — resus episode + immutable append-only timeline + record (prove immutability + reconstructability + audit + RLS + encryption). Migration `0038`.
- **GATE C** — ABCDE engine (assess→action, sequence discipline, treat-before-proceed, reassess prompts, open-life-threats tracker, return-to-A, anaphylaxis cross-cut, **signed-off** dose constants only).
- **GATE D** — continuous monitoring + trend strip + derived metrics + post-intervention reassessment prompts (timed cadence; manual + device-ready).
- **GATE E** — team mobilisation + shared live view + role assignment (cadre-scoped) + arrest-detection→stub seam.
- **GATE F** — closeout + CSO sign-off (decision-support-not-autonomous verified; dose constants verified at build; record immutable/versioned; ABCDE discipline; mobilisation; arrest routes to stub; continuous monitoring; a11y AA; reduced-motion; existing tests green; no shipped migration altered; ADRs; CHANGELOG/README).

---

## J. Sources (cited; verified at build per item in §A.3)

2025 AHA Guidelines for CPR & ECC (Circulation, Oct 22 2025); ERC Guidelines 2025 (incl. Special Circumstances — anaphylaxis 0.5 mg IM, repeat <5 min); ILCOR 2025 CoSTR; Resuscitation Council UK — ABCDE approach; RCUK Emergency Treatment of Anaphylaxis; ATLS (trauma primary survey, xABCDE); Surviving Sepsis Campaign 2021; NEWS2 (RCP 2017); BTS Guideline for Oxygen Use in Adults 2017; JBDS-IP Hospital Management of Hypoglycaemia in Adults (Jan 2023); NICE NG217 (status epilepticus, updated Jan 2025); CRASH-2 (Lancet 2010/2011) + CRASH-3 (Lancet 2019). **The 2025 cycle supersedes 2020/2021.**

---

**⛔ GATE A stop. Awaiting CSO (Fadhul) sign-off on §A (clinical model + doses), §D (mobilisation + roles), and the §H open questions. No code, no migration, no dose constant until then.**
