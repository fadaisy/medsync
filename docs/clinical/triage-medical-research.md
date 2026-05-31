# MedSync — Triage: Medical Research & Reference

### International triage frameworks, scoring systems, vital-sign thresholds, and physiological relationships

_Compiled to ground MedSync's smart-triage build. Sources: AHRQ/ENA (ESI v5), Royal College of Physicians (NEWS2), Emergency Medicine Society of South Africa (SATS/TEWS), Sepsis-3/qSOFA, Brighton/Monaghan PEWS, MEOWS. All thresholds verified against primary clinical sources. This is decision-support reference, not a substitute for clinician judgement — every score must be overridable by a trained clinician._

> **Provenance:** This document is the authoritative clinical source for the MedSync triage engine, supplied by the Clinical Safety Officer (Fadhul) at the triage kickoff and committed verbatim so the build, the ADRs, and the CSO sign-off all cite one versioned copy. Do not edit clinical thresholds here without CSO authorship.

---

## 0. What triage is, and the one rule above all rules

Triage = sorting patients by **acuity** (how urgently they need care) and, secondarily, by **resource need**, to get the right patient to the right place at the right time. Its purpose: answer _"who is seen first, how long can each wait, what do they need."_

**The overriding safety principle: under-triage kills.** Every validated system is deliberately biased toward **over-triage** (erring toward higher acuity) because the cost of making a sick patient wait is catastrophic, while the cost of over-prioritising a well one is merely inefficiency. MedSync's smart triage must embed this asymmetry: **when uncertain, escalate.** And every automated score must be **clinician-overridable upward or downward** with a logged reason — the tool advises, the clinician decides.

A second principle from the South African experience, directly relevant to Uganda: in high-HIV/TB-burden populations, **chronically unwell patients have abnormal baseline vitals** (a TB patient may be tachypnoeic, febrile, hypoxic at baseline) and will score high without being acutely dying. Smart triage must allow context/baseline adjustment and not blindly over-triage the chronically ill — while never under-triaging genuine deterioration.

---

## 1. The five-tier acuity model (the universal spine)

Every major system maps to a 4- or 5-level acuity scale. MedSync should adopt a **5-level model** with a colour + number + target-time mapping (harmonising ESI numbering with SATS colours):

| Level                              | Colour         | Meaning                                           | Typical target time to clinician |
| ---------------------------------- | -------------- | ------------------------------------------------- | -------------------------------- |
| **1**                              | **Red**        | Immediate life-saving intervention needed now     | Immediate (0 min)                |
| **2**                              | **Orange**     | High risk / time-critical; could deteriorate fast | ~10 min                          |
| **3**                              | **Yellow**     | Urgent, stable, needs several resources           | ~60 min                          |
| **4**                              | **Green**      | Less urgent, few resources                        | ~2 h (routine)                   |
| **5**                              | **Blue/White** | Non-urgent, minimal resources                     | Routine / can wait               |
| _(Blue in SATS = dead on arrival)_ |                |                                                   |                                  |

Targets are illustrative (vary by system/resourcing); MedSync should make them **configurable per hospital** but default to these.

---

## 2. ESI v5 — Emergency Severity Index (USA; acuity + resource logic)

The most-used US ED algorithm. **Four sequential decision points (A–D); higher-acuity patients exit early.** Levels 1–2 are pure acuity; levels 3–5 add expected resource count.

- **Decision A — "Does the patient require an immediate life-saving intervention?"** — if yes, **Level 1.** (airway/respiratory support, emergency meds, haemodynamic intervention, e.g. cardiac arrest, unresponsive, profound hypotension/hypoglycaemia.)
- **Decision B — "Is this a high-risk situation, OR confused/lethargic/disoriented, OR in severe pain/distress?"** — if yes, **Level 2.** (high risk of deterioration, new altered mental status, time-critical problem, e.g. cardiac-sounding chest pain, asthma attack, severe pain.)
- **Decision C — "How many different resources will this patient need?"** (resources = labs, ECG, imaging, IV fluids, IV/IM/neb meds, specialty consult, simple procedures — NOT counted: history/exam, point-of-care test, oral meds, simple wound care, crutches/splints, prescriptions.)
  - **none → Level 5**
  - **one → Level 4**
  - **two or more → Level 3** (then check Decision D)
- **Decision D — Danger-zone vital signs (for would-be Level 3):** if any vital sign exceeds the danger threshold, **consider upgrading to Level 2.** (v5 makes HR/RR/SpO₂ checks mandatory at this point.)
  - **HR > 100, RR > 20, SpO₂ < 92%** (adult danger zone; plus age-specific paediatric cutoffs below).

**Key teaching point ESI embeds:** the "well-appearing ill" — patients who look fine but whose vitals signal instability. A full vital-sign set is mandatory before assigning Level 3–5.

---

## 3. NEWS2 — National Early Warning Score 2 (UK RCP; the vital-sign engine)

The backbone for **objective physiological scoring of adults** (not pregnant, ≥16y). Six parameters + supplemental-oxygen flag, each scored 0–3; aggregate 0–20. **This is the single most important scoring table for MedSync's "smart vitals."**

| Parameter                                           | **3** | **2**  | **1**     | **0**                 | **1**       | **2**       | **3**                                        |
| --------------------------------------------------- | ----- | ------ | --------- | --------------------- | ----------- | ----------- | -------------------------------------------- |
| **Respiratory rate** (/min)                         | ≤8    | —      | 9–11      | 12–20                 | —           | 21–24       | ≥25                                          |
| **SpO₂ Scale 1** (%)                                | ≤91   | 92–93  | 94–95     | ≥96                   | —           | —           | —                                            |
| **SpO₂ Scale 2** (%, hypercapnic/COPD target 88–92) | ≤83   | 84–85  | 86–87     | 88–92 (or ≥93 on air) | 93–94 on O₂ | 95–96 on O₂ | ≥97 on O₂                                    |
| **Air or oxygen**                                   | —     | O₂     | —         | Air                   | —           | —           | —                                            |
| **Systolic BP** (mmHg)                              | ≤90   | 91–100 | 101–110   | 111–219               | —           | —           | ≥220                                         |
| **Pulse** (/min)                                    | ≤40   | —      | 41–50     | 51–90                 | 91–110      | 111–130     | ≥131                                         |
| **Consciousness**                                   | —     | —      | —         | Alert                 | —           | —           | CVPU (new Confusion/Voice/Pain/Unresponsive) |
| **Temperature** (°C)                                | ≤35.0 | —      | 35.1–36.0 | 36.1–38.0             | 38.1–39.0   | ≥39.1       | —                                            |

**Supplemental-oxygen rule:** **+2 to the aggregate** if the patient needs any supplemental O₂ to maintain target sats.
**SpO₂ Scale 2** is used ONLY for patients with confirmed hypercapnic respiratory failure (typically COPD with a documented 88–92% target) — a clinician must explicitly enable Scale 2; never auto-default to it.

**Clinical-risk thresholds & response:**
| Aggregate | Risk | Response (configurable per hospital) |
|---|---|---|
| **0–4** | Low | Routine monitoring |
| **3 in any single parameter** ("red score") | Low–medium | Urgent review by clinician; the single-parameter rule catches isolated severe derangement even at low total |
| **5–6** | Medium | Urgent clinician review; consider higher-care |
| **≥7** | High | Emergency/critical-care-level response |

**Smart-triage integration:** NEWS2 ≥5, or any single parameter = 3, is the canonical "escalate" trigger. MedSync should compute NEWS2 automatically from logged vitals and map it onto the 5-tier acuity (≥7 → Red/Orange, 5–6 → Orange/Yellow, single-3 → at least Yellow with review).

---

## 4. SATS / TEWS — South African Triage Scale (best-validated low-resource system; most relevant to Uganda)

**Why it matters for MedSync:** a 2018 systematic review found SATS had the **highest-quality evidence among LMIC adult triage tools** (sensitivity ~70–75%, specificity ~91–97%). It's designed for exactly MedSync's setting. SATS = **TEWS (a vital-sign score) + a discriminator list (clinical red-flags) → final colour.**

**TEWS components** (each scored, summed 0–17): mobility, respiratory rate, heart rate, systolic BP, temperature, AVPU (mental status), and trauma presence.
**TEWS → colour:**
| TEWS | Colour / acuity |
|---|---|
| 0–2 | **Green** (routine) |
| 3–4 | **Yellow** (urgent) |
| 5–6 | **Orange** (very urgent) |
| ≥7 | **Red** (immediate) |
| — | **Blue** = dead on arrival |

**The discriminator list (the "smart" override):** the final colour is the **higher** of (a) the TEWS colour and (b) the colour triggered by any present discriminator. A discriminator is a high-risk clinical sign/symptom (e.g. active seizure, chest pain, severe haemorrhage, pregnancy with abdominal pain) that **upgrades** acuity regardless of vitals. _Example from the field: a patient is green on TEWS but has severe abdominal pain (a discriminator) → upgraded to yellow._ This two-track design (objective score OR clinical red-flag, take the worse) is the model MedSync should follow.

**SATS has separate adult and paediatric charts** (paediatric used for <12y or <150cm) — age/size-appropriate thresholds matter (section 7).

**Caution SATS itself flags:** TEWS over-triages (7 items — one deviation in each tips to red), and chronically ill high-burden patients score high at baseline — reinforcing the need for the discriminator + clinician override rather than score-alone.

---

## 5. Sepsis recognition — qSOFA & sepsis red flags (overlay on any triage)

Sepsis is a time-critical "must-not-miss" that triage must actively screen for (NEWS2 was explicitly designed to catch it too).

**qSOFA (quick SOFA) — 1 point each, outside ICU:**

- **Respiratory rate ≥ 22 /min**
- **Altered mentation** (GCS < 15)
- **Systolic BP ≤ 100 mmHg**
  **qSOFA ≥ 2** → high suspicion of sepsis with poor prognosis → escalate, investigate, start sepsis pathway. _(Note: qSOFA is specific but not very sensitive — use as a red-flag overlay, not a rule-out; NEWS2 ≥5 is a more sensitive early-sepsis trigger.)_

**Septic-shock indicators (higher acuity):** lactate > 2 mmol/L despite fluids, vasopressor need to keep MAP ≥ 65 mmHg.
**Smart-triage rule:** any infection symptoms + (qSOFA ≥2 OR NEWS2 ≥5) → Red/Orange sepsis pathway.

---

## 6. Shock index & derived vital relationships (the "what this vital implies about that vital" layer)

This is the **physiological-reasoning layer** that makes triage _smart_ rather than a lookup table. Key relationships:

- **Shock Index (SI) = HR ÷ systolic BP.** Normal 0.5–0.7. **SI > 0.9** suggests haemodynamic compromise/occult shock (often _before_ BP frankly drops). **SI ≥ 1.0** is a strong deterioration flag. _Why it's smart: a patient with HR 110 and SBP 105 has "normal-ish" individual numbers but SI ≈ 1.05 → occult shock the raw numbers hide._ Obstetric variant: **Modified Shock Index (MSI = HR ÷ MAP)** and pregnancy-adjusted thresholds matter (section 8).
- **Compensated vs decompensated shock:** the body defends BP until it can't. **Tachycardia + narrowing pulse pressure + tachypnoea with a still-normal systolic BP = compensated shock** — a pre-terminal warning, especially in children and pregnant women who compensate well then crash. Hypotension is a **late** sign. Smart triage must weight tachycardia/tachypnoea + rising SI, not wait for hypotension.
- **Pulse pressure** (SBP − DBP): **narrow** (<25% of SBP) → hypovolaemia/poor stroke volume; **wide** → consider sepsis (vasodilation), aortic pathology.
- **SpO₂ + respiratory rate together:** a **normal SpO₂ with a high RR** is a patient _working hard to stay saturated_ — respiratory distress that will fail; do not be reassured by the sat alone. **Falling SpO₂ + rising RR** = decompensating respiratory failure. **Falling SpO₂ + falling RR** = peri-arrest (exhaustion/CO₂ narcosis) → Level 1.
- **Temperature + HR:** fever drives ~10 bpm per °C; tachycardia _out of proportion_ to fever, or **hypothermia (<36°C) with tachycardia**, suggests sepsis (cold sepsis is worse-prognosis than warm).
- **HR + consciousness:** bradycardia + hypertension + irregular breathing = **Cushing's reflex** → raised intracranial pressure → Level 1.
- **Glucose as a vital:** **<3.0 mmol/L (hypoglycaemia)** = immediate intervention (mimics stroke/altered mentation, instantly reversible). **>15 mmol/L + ketones/acidosis** → DKA pathway. (Directly relevant to MedSync's NCD/diabetes focus — a logged home glucose of 17 mmol/L with symptoms is a triage event.)
- **Trend > snapshot:** a single value matters less than its **trajectory**. A NEWS2 rising 2→5 over hours is more dangerous than a static 5. MedSync already stores longitudinal vitals — triage should read the **trend**, not just the latest reading. This is a genuine MedSync advantage (it has the home-monitoring history most ED triage lacks).

---

## 7. Paediatric triage (children are NOT small adults — age-specific thresholds)

Vital-sign norms shift dramatically by age, so adult cutoffs **massively under-triage** children. Use age-banded normals (Pediatric Advanced Life Support / Brighton PEWS basis):

**Approximate normal ranges by age (deviations score points):**
| Age | RR (/min) | HR (/min) | Systolic BP (mmHg, lower limit ≈ 70 + 2×age in years) |
|---|---|---|---|
| <1 y (infant) | 30–60 | 100–160 | >70 |
| 1–2 y | 24–40 | 90–150 | >74 |
| 2–5 y | 22–34 | 80–140 | >78 |
| 6–12 y | 18–30 | 70–120 | >82 |
| >12 y | 12–20 | 60–100 | >90 (≈ adult) |

**PEWS (Paediatric Early Warning Score, Brighton/Monaghan):** scores 3 domains — **behaviour/consciousness, cardiovascular (colour, cap refill, HR), respiratory (RR, effort, SpO₂/O₂ need)** — each 0–3, summed. **PEWS ≥ 3 → escalate** (senior review, increase monitoring frequency, consider ICU); higher scores strongly predict deterioration/ICU need/mortality. Like SATS, designed to be **trended**.
**Paediatric red flags:** grunting, nasal flaring, severe recession, cyanosis, cap refill >3s, non-blanching rash (meningococcal), inconsolability/high-pitched cry, reduced wet nappies (dehydration), any infant <3 months with fever ≥38°C.
**MedSync rule:** triage must branch to **age-appropriate norms** the moment age <12y (or <150cm, per SATS) — never apply adult NEWS2 to a child.

---

## 8. Obstetric triage — MEOWS (pregnancy changes the rules)

Pregnant/recently-pregnant women have **altered physiology** (higher HR, lower BP, higher RR are _normal_), so standard scores mislead, and they **compensate then crash**. **MEOWS** = a NEWS-style colour-coded chart tuned for obstetrics (antepartum, labour, postpartum), parameters: RR, SpO₂, temperature, HR, systolic & **diastolic** BP, AVPU, urine output, plus obstetric-specific (lochia, liquor, pain, "looks unwell").
**Trigger logic:** a single **Red** parameter, or **two Yellow** parameters, triggers escalation (immediate clinician/attending call for red).
**Obstetric must-not-miss red flags:** systolic ≥160 or diastolic ≥110 (severe pre-eclampsia → stroke/eclampsia risk), seizure (eclampsia), heavy PV bleeding (PPH/abruption/placenta praevia), reduced fetal movements, severe headache + visual disturbance + epigastric pain (pre-eclampsia triad), sepsis (chorioamnionitis). **Modified Shock Index (HR/MAP) > 1.7** flags obstetric haemorrhage early.
**MedSync rule:** any patient flagged pregnant/≤6 weeks postpartum → MEOWS thresholds + obstetric discriminators, **not** standard NEWS2; emergency-obstetric-referral entry type (from entry points) pre-flags this.

---

## 9. The smart-triage logic MedSync should implement (synthesis)

Combining the above into MedSync's model — a **two-track, context-aware, trend-aware, always-overridable** engine:

1. **Step 0 — Immediate life threat?** (ESI-A / SATS emergency signs): airway compromise, not breathing/agonal, no pulse, unresponsive, active seizure, exsanguinating haemorrhage, SpO₂ critically low. → **Level 1 Red, bypass scoring, resus now.** (Triage-before-treatment is waived for a patient already in arrest.)
2. **Step 1 — Pick the right ruleset by population:** adult (NEWS2-based) / paediatric (PEWS + age norms) / obstetric (MEOWS). Driven by age + pregnancy flag (entry-point data helps).
3. **Step 2 — Compute the objective score** from the (auto-captured) vitals: NEWS2 / PEWS / MEOWS, including derived metrics (shock index, pulse pressure, qSOFA overlay, glucose).
4. **Step 3 — Apply the discriminator/red-flag list** (SATS-style): chest pain, focal neuro deficit, sepsis suspicion, severe pain, obstetric red flags, mechanism-of-injury, etc. — each maps to a minimum acuity.
5. **Step 4 — Take the WORSE of (score-derived acuity) and (discriminator acuity).** Never average; safety = the higher.
6. **Step 5 — Apply trend & context:** worsening trajectory escalates; known chronic-abnormal baseline (with clinician confirmation) may temper over-triage — but never below a triggered red-flag.
7. **Step 6 — Output:** acuity level + colour + target time + suggested disposition/area + the _reasons_ (which parameters/flags drove it), all **transparent** so the clinician sees the "why."
8. **Step 7 — Clinician override (mandatory capability):** any trained triage clinician can move the level up or down with a **logged reason.** The score advises; the human decides. **When in doubt, the system biases UP.**

**Entry-point → triage coupling (ties to the prior build):** the entry type pre-seeds the starting point — emergency referral / emergency self-presentation → enter at Step 0 fast-track; walk-in/routine → full Step 1–7; booked follow-up with a monitoring-alert origin → carry the alerting vital straight into Step 2. Never block emergency triage on missing data.

---

## 10. Safety, governance & honesty notes for the build

- **Decision support, not decision-maker.** Every output is advisory + overridable + logged. The triage clinician (per cadre/scope) owns the decision. Document this as a **clinical-safety artifact** for Clinical Safety Officer sign-off.
- **Bias to over-triage; never silently under-triage.** Uncertainty escalates.
- **Transparent reasoning.** Always show which vitals/flags produced the level — never a black-box number.
- **Configurable thresholds & target times** per hospital, but safe defaults from the validated tables above; changes audited.
- **Age/pregnancy routing is mandatory** — wrong ruleset = dangerous mis-triage.
- **Trend-aware** — MedSync's longitudinal home-monitoring data is a real advantage; use it.
- **Don't fabricate / don't guess** missing vitals — flag incomplete vital sets (ESI's "well-appearing ill" lesson); a missing RR is itself a flag to obtain it.
- **Local validation needed.** These tools are internationally validated, but MedSync should plan local validation/audit of its triage performance (over/under-triage rates) in the Ugandan context before relying on it unsupervised.
- **Source frameworks:** ESI v5 (ENA/AHRQ), NEWS2 (RCP 2017), SATS/TEWS (EMSSA), Sepsis-3/qSOFA, Brighton/Monaghan PEWS, MEOWS — to be cited in the clinical documentation.

---

## 11. Quick-reference: the adult danger vitals (memorise-grade)

- **RR ≥ 25 or ≤ 8** → high concern (NEWS2 +3 each end)
- **SpO₂ < 92%** (or <88% if COPD-target) → high concern
- **SBP ≤ 90** (or ≥ 220) → high concern; **SI > 0.9** → occult shock
- **HR ≥ 131 or ≤ 40** → high concern
- **Temp ≥ 39.1 or ≤ 35.0** → high concern (cold = worse in sepsis)
- **Any new drop in consciousness (CVPU)** → high concern
- **Glucose < 3.0** → immediate; **> 15 + symptoms** → DKA pathway
- **NEWS2 ≥ 7, or 5–6, or any single parameter = 3** → escalate
- **qSOFA ≥ 2 with infection** → sepsis pathway
  _(Paediatric and obstetric thresholds differ — route first, then score.)_
