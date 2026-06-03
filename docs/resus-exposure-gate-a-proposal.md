# Resus · EXPOSURE step — GATE A proposal (clinical sign-off)

**Status:** Built A→E on `feat/resus-exposure` under the CSO instruction "go through all gates"; the clinical content is the **CSO-supplied catalog** ([`docs/clinical/resus-exposure-clinical-catalog.md`](clinical/resus-exposure-clinical-catalog.md), committed verbatim, encoding normalised), presented here for sign-off. **This completes the ABCDE primary-survey set.**
**Scope:** the **Exposure (E)** step — exposure's **findings → suspected-diagnosis → triggered-actions → action-states**, built by **reusing the A/B/C/D engine + visual system** with "what got missed" emergency medicine; PLUS the **return-to-A "cycle the primary survey" loop** (E is where one ABCDE pass completes and the next begins). Drugs route through the **smart prescribing tool**. Record + decision-support + escalation now; full hypothermia-ECLS / heatstroke-cooling / burns / nec-fasc / secondary-survey / toxidrome _procedural_ tooling + paediatric(+NAI)/obstetric depth deferred (§C).

> **Honesty posture.** **No NEW drug dose was introduced for E** — every E drug already lives, web-verified (2026-06-03), in the prescribing catalog: antibiotics (`sepsis_antibiotics`), IM adrenaline (`adrenaline_anaphylaxis_im`), naloxone (`naloxone_iv`), warmed crystalloid (`crystalloid_bolus`), benzodiazepines (`lorazepam_seizure_iv`/`midazolam_seizure_buccal`). Dantrolene (malignant hyperthermia) is the one specialist drug NOT in the catalog — deferred to record + escalation by design. Temperature thresholds (hypothermia mild 32–35 / moderate 28–32 / severe <28; hyperthermia ≥40) are the catalog's, per ICAR/WMS; re-verified at build.

---

## Preface — reuses the A/B/C/D pattern (no rebuild)

E **reuses** the findings→action→state engine, the action-state lifecycle (`indicated/in_progress/performed/not_indicated/deferred/failed`, `failed`→escalation), the severity colour + action-state tokens + the step bar, and the urgency-ordered display ([ADRs 0048–0050, 0053, 0055](adr/0055-resus-disability-findings-action-engine.md)) — populated with exposure content. Mirrors `lib/resus/disability.ts` + `disability-catalog.ts` as `lib/resus/exposure.ts` + `exposure-catalog.ts`, and `exposure-panel.tsx` mirroring the disability panel. **No new migration** — findings/actions are step-`E` timeline events (`step: "E"`).

## A. Clinical model

### A.1 — Two outputs (mirrors C/D)

- **Exposure-state** (severity, worst-finding-wins): `no_new_critical_finding → significant_finding → temperature_extreme → critical_finding`. `classifyExposure(fs)`. A temperature extreme (≤35 / ≥40) is never downgraded by an otherwise-benign survey.
- **Suspected diagnosis** (`identifyExposureDiagnosis`, the action-driving axis): `meningococcal_sepsis → anaphylaxis → occult_haemorrhage → severe_hypothermia → hyperthermia_heatstroke → necrotising_fasciitis → limb_threat → opioid_patch_toxicity → hypothermia → none`. Ordered most-time-critical first.
- **The E-distinctive element: the LOOP.** E is **not a dead-end** — after treating what's found, the engine surfaces **"primary survey complete → RETURN TO A and cycle"**, and the desk navigation loops back to A (continuous reassessment). Plus **core temperature** (with hypothermia/hyperthermia staging) and an **AMPLE history** capture whose **allergies feed the prescribing-tool allergy check**.

### A.2 — Findings (catalog §1)

Headline **exposure-state** + **SKIN/RASH** (non-blanching rash, urticaria/angioedema, mottling, burns/blistering, pain-out-of-proportion/crepitus, track marks, jaundice) + **BLEEDING/WOUNDS/INJURY** (external haemorrhage, wounds, bruising/haematoma, abdominal distension, pelvic instability, long-bone deformity, **the back via log-roll**, limb ischaemia, DVT signs) + **TEMPERATURE** (core temp °C → staging) + **PATCHES/LINES** (transdermal patch, lines/devices) + **AMPLE history**. Context: `trauma`, `exposureEnvironment`, `serotonergicOrNeuroleptic` (hyperthermia cause), `notRecovered` (the re-cover trap), `noPulse`.

### A.3 — Actions (catalog §2)

- **Tier 1 baseline:** expose + examine head-to-toe, **measure temperature**, **COVER + keep warm** (re-cover), AMPLE history + chart review, **log-roll (trauma)**, **RETURN TO A (cycle)**, monitoring.
- **Tier 2 cause-specific:** non-blanching rash → **don't-delay antibiotics**; anaphylaxis → **IM adrenaline**; hypothermia → gentle handling + passive/active-external rewarming + **warmed IV fluids** + ECLS for severe/arrest + treat-cause (cold sepsis); hyperthermia → **active cooling** + cause-specific (serotonin/NMS/thyroid/MH); occult haemorrhage → **back to C**; patch → **remove** + naloxone if opioid; limb-threat/nec-fasc → **surgical referral**.
- **Tier 3 advanced (record + escalate):** ECLS, surgical/specialty, ICU.
- **Drug actions route through the prescribing tool** — new `e_*` codes in `RECOMMENDATION_DRUG_MAP` (none exist yet; added at GATE C). Doses NOT duplicated here.

### A.4 — The traps (enforced in `triggeredActions` + the colour/guard)

1. **⚠️ NON-BLANCHING rash = meningococcal sepsis → do NOT delay antibiotics** — flagged critical + the antibiotic action surfaced at the top.
2. **⚠️ Unexplained hypothermia → think SEPSIS (cold sepsis)** — a low temp prompts the septic screen + "if not rewarming ~1 °C/hr, reconsider sepsis/hypothyroid."
3. **Occult haemorrhage hides on the back/pelvis/abdomen/thigh** → the engine prompts **log-roll + full exposure**, then back-to-C.
4. **Expose → examine → RE-COVER + keep warm** — leaving the critically ill exposed causes iatrogenic hypothermia → coagulopathy; the re-cover action is always surfaced (and flagged if `notRecovered`).
5. **Hypothermic arrest: "not dead until warm and dead"** — the arrest stub carries the **hypothermia modifier** (continue CPR, rewarm >32 °C before termination; the full logic is the arrest module).
6. **Transdermal patches** are easily missed → prompt to look for/remove (opioid patch + low GCS/RR → naloxone).
7. **After E → RETURN TO A** — the loop is explicit (not a dead-end).

### A.5 — Drug coverage (the honest audit)

**All of E's drugs are already in the verified prescribing catalog** (cover meningococcaemia / anaphylaxis / opioid-patch / warmed-fluids / serotonin-NMS sedation): `sepsis_antibiotics`, `adrenaline_anaphylaxis_im`, `naloxone_iv`, `crystalloid_bolus`, `lorazepam_seizure_iv`/`midazolam_seizure_buccal`. **No new drug entry + no new dose to web-verify** (unlike D's eclampsia magnesium). The one gap — **dantrolene** (malignant hyperthermia) — is a specialist anaesthetic drug, **deferred to record + escalation** per the kickoff. New `e_*` recommendation codes only (added at GATE C).

## B. Schema (no new migration)

Reuse the findings/actions/states timeline model (step `E`). **E-specific finding-set fields** on the `assessment` payload (`payload.exposure`): `state`, `present[]`, `coreTempC` (→ staging), `ample` `{ allergies[], medications?, past?, lastMeal?, events? }`, `notRecovered`/`loggedRoll`, `context`. Recorded payload also stores `exposureState` + `suspectedDiagnosis` + `tempStage`. **AMPLE allergies are written via the existing `recordResusAllergies`** so they feed the prescribe-time allergy check + the record. Findings via `recordExposureFindings`; action/procedure states via `setExposureActionState`; drugs via `recordEmergencyAdministration`. The **return-to-A** is recorded as a timeline event + navigates the desk back to A.

## C. Scope / deferrals

- **Now:** findings + exposure-state + temperature(+staging) + AMPLE + suspected-diagnosis, the diagnosis-driven action engine + the traps, action-state lifecycle (`failed`→escalation), urgency-ordered display, treat-before-moving-on, the **return-to-A loop**, AMPLE→allergy-check feed, no-pulse→arrest stub (hypothermia modifier noted), drugs via the prescribing tool.
- **Deferred (record + escalation only, flagged):** full hypothermia/ECLS pathway, detailed heatstroke-cooling, burns (TBSA/Parkland), nec-fasc/surgical pathways, secondary-survey tooling, toxidrome/poisoning workflow, dantrolene/MH; paediatric (+NAI awareness) + obstetric depth.

## D. Build order

GATE A (model + catalog + loop + drug audit) · GATE B (findings + exposure-state + temperature + AMPLE, TDD) · GATE C (diagnosis-driven action engine + traps + e\_\* prescribing link, TDD) · GATE D (panel + temperature/AMPLE/re-cover + the **return-to-A loop** + desk wiring + arrest stub) · GATE E (adversarial review + ADR + CHANGELOG + tests/build green). **Stop for CSO sign-off.**
