# MedSync — Clinical Clerkship (Clerking) Reference

### The structured history & examination flow for the encounter engine — anchored to Hutchison's Clinical Methods

> **Purpose.** The clinical content for MedSync's **clerkship flow** — the structured clinical clerking (full history + examination → differential → initial management) that a clinician performs within an encounter. This is the **medicine**; the build is the encounter-engine addendum (`encounter-engine-clerkship-addendum.md`). It makes the encounter's clinical documentation a **proper, guided clerking**, not a free-text box.
>
> **Primary source:** **Hutchison's Clinical Methods, 24th edition** (Glynn M, Drake WM, eds.) — Section 1 (General patient assessment): Ch 1 _Doctor and patient: general principles of history taking_ (Glynn), Ch 2 _General patient examination and differential diagnosis_ (Drake & Chowdhury), Ch 3 _The next steps: differential diagnosis and initial management_ (Glynn), Ch 4 _Ethical considerations_ (Drake). Section 2 (particular groups) and Section 3 (system-based examinations) extend it.
> **Supplementary (verify at build):** Calgary–Cambridge consultation guide; NICE/WHO guidance; ICD-10 (diagnoses), LOINC (investigations) per the encounter engine. **2025-current guidance supersedes older where they differ.**
>
> **Clinical-safety status:** decision-support + structured documentation, not autonomous — it **guides and records** the clerking; the clinician examines, reasons, and decides. **CSO (Fadhul) sign-off** of the clerking structure + any embedded clinical content. Build onto this over time (the first, extensible layer).

---

## 0. WHAT A CLERKSHIP IS (the encounter's clinical core)

"Clerking" = the structured process by which a clinician takes a **full history**, performs a **physical examination**, synthesises a **differential diagnosis**, and forms an **initial management plan** — the traditional clinical method Hutchison teaches. In MedSync it is the **clinical substance of an encounter**: triage hands off → the clinician _clerks_ the patient → the clerking populates the encounter's documentation, problem list, diagnoses, orders, and plan.

**Governing principles (Hutchison Ch 1–3):**

- **History first, and it carries most of the diagnosis** — a careful history yields the diagnosis (or the short differential) in the majority of cases; examination and investigations confirm/refine.
- **Patient-centred AND disease-centred** — open-ended questions to let the patient tell their story (the _illness_ framework: experiences, ideas, concerns, expectations), balanced with direct questions (the _disease_ framework). Don't railroad to an assumed diagnosis.
- **Clarify, never take at face value** — clarify vague terms ("dizzy", "diarrhoea"); probe (esp. pain, alcohol, the retrospective/past history).
- **A timeline approach** — build the story chronologically; past and present often blur (acute-on-chronic).
- **Screen the whole patient** — the systematic enquiry + full examination catch the relevant problem the patient didn't present with.
- **Then synthesise** — differential (most-likely + must-not-miss), then initial investigations + management. Ethical practice + consent throughout (Ch 4).

> **The clerkship is structured but flexible** — each clinician develops a personal scheme, and _particular situations_ (emergency, paediatric, obstetric, psychiatric, the elderly, the garrulous/angry/anxious patient, language barriers) modify it. The flow guides; it never straitjackets.

---

## 1. THE HISTORY (Hutchison Ch 1 — the schematic history)

### 1.1 Identifying / demographic data + the opening

- Name, age, sex, occupation, the source + reliability of the history (patient / collateral / notes / referral letter).
- **The opening:** a single **open-ended question** ("Tell me about what has led up to you coming here today") — let the patient give a free account before direct questioning. Note the _reason_ for presentation (and who initiated it).

### 1.2 Presenting complaint (PC)

- The main symptom(s) **in the patient's own words**, with duration. (May be several; record each.)

### 1.3 History of presenting complaint (HPC)

- The full chronological story of each presenting complaint — onset, course, current state.
- **Symptom analysis** — for any symptom, the classic clarifiers; **for PAIN specifically (Hutchison Box 1.8 / SOCRATES):** **S**ite, **O**nset, **C**haracter, **R**adiation, **A**ssociated symptoms, **T**iming/duration, **E**xacerbating/relieving factors, **S**everity (a pain scale). (Patterns: central crushing chest pain radiating to the arm → cardiac; colicky → hollow organ; thunderclap "hammer blow" → SAH.)
- Relevant **risk factors, exposures, and the patient's own ideas/concerns/expectations** woven in.

### 1.4 Past medical & surgical history (PMH/PSH)

- Previous illnesses, operations, admissions, significant investigations; chronic conditions; obstetric history where relevant.
- **Retrospective history** — don't accept a patient's medical-label at face value; probe what actually happened (a reported "heart attack" may have been something else).
- Always-ask: diabetes, hypertension, cardiac/respiratory disease, stroke/epilepsy, jaundice/hepatitis, TB, **(Uganda-relevant) HIV status, TB, malaria, sickle-cell** — and immunisations where relevant.

### 1.5 Drug history (DH) + allergies

- All current medications (name, dose, route, frequency, adherence), OTC/herbal/traditional remedies, recent changes.
- **ALLERGIES + adverse reactions — explicit, with the reaction** (critical-safety; feeds the encounter engine's allergy list, surfaced at prescribing).

### 1.6 Family history (FH)

- First-degree relatives' health, causes of death + ages; heritable/familial conditions; a genogram where useful.

### 1.7 Social & personal history (SH)

- **Occupation** (+ occupational exposures), home circumstances, who's at home / dependants / carers, function + ADLs (esp. elderly), mobility.
- **Smoking** (pack-years), **alcohol** (units/week — convert; probe carefully, **CAGE** if excess suspected: **C**ut down, **A**nnoyed, **G**uilty, **E**ye-opener), **recreational drugs**.
- Travel, pets, sexual history where relevant; diet; **functional + social context** (the illness framework).

### 1.8 Systematic (systems) enquiry — "review of systems" (Hutchison Box 1.7)

Direct questions across **all** systems to catch what the PC didn't surface:

- **General:** weight change, appetite, fever/sweats, fatigue, sleep, lumps.
- **Cardiovascular:** chest pain, dyspnoea (+ exertional, orthopnoea, PND), palpitations, ankle swelling, claudication, syncope.
- **Respiratory:** cough, sputum, haemoptysis, dyspnoea, wheeze, pleuritic pain.
- **Gastrointestinal:** appetite/weight, dysphagia, nausea/vomiting, haematemesis, abdominal pain, bowel habit change, rectal bleeding/melaena, jaundice.
- **Genitourinary:** dysuria, frequency, nocturia, haematuria, incontinence, discharge; menstrual/obstetric; sexual function.
- **Neurological:** headache, fits/faints/funny-turns, dizziness/vertigo, weakness, numbness/paraesthesia, visual/speech/swallowing disturbance, memory/cognition.
- **Musculoskeletal:** joint pain/swelling/stiffness, back pain, muscle pain/weakness, function.
- **Endocrine:** heat/cold intolerance, polyuria/polydipsia, neck swelling.
- **Skin:** rashes, lesions, itch, changing moles.
- (+ psychiatric screen — mood, anxiety, risk — where indicated; ENT/eyes as relevant.)

### 1.9 Particular situations (modifiers — Hutchison Ch 1 + Section 2)

The flow must adapt: **emergency** (focused/parallel to resus — defer the full clerking; ABCDE first), **paediatric**, **obstetric/women**, **older people**, **psychiatric**, **fever**, **pain**; and communication situations (garrulous, angry, anxious, silent, language barrier, accompanying persons, the well-informed patient). _(Later layers — flagged, not built first.)_

---

## 2. THE EXAMINATION (Hutchison Ch 2 + Section 3)

### 2.1 General inspection ("end-of-bed" / first impression)

- General appearance: well/unwell, distress, posture, body habitus, nutritional state.
- **Recognisable patterns** (the "spot diagnosis"): cushingoid, acromegalic, thyroid eye signs, parkinsonian, jaundice, pallor/anaemia, cyanosis, respiratory distress.
- Vital signs (links to the vitals/monitoring engine), level of consciousness.
- **Hands → arms → face/eyes/mouth → neck → then systems** (the classic order).

### 2.2 The peripheral / general signs

- Hands (clubbing, koilonychia, leuconychia, splinter haemorrhages, palmar erythema, Dupuytren's, tremor, tar staining), pulse + BP.
- Eyes (jaundice/sclerae, anaemia/conjunctivae, Horner's, fundoscopy where indicated), mouth (hydration, central cyanosis, dentition), face.
- Neck (JVP, lymph nodes, thyroid, carotids). Lymphadenopathy, oedema, skin.

### 2.3 System examinations (Hutchison Section 3 — each: Inspection → Palpation → Percussion → Auscultation, IPPA)

- **Cardiovascular** (Ch 13): pulse, BP, JVP, apex, heaves/thrills, heart sounds + murmurs, oedema, peripheral pulses.
- **Respiratory** (Ch 12): rate/pattern, expansion, trachea, percussion, breath sounds + added sounds, vocal resonance.
- **Gastrointestinal/abdomen** (Ch 14): inspection, palpation (tenderness, guarding, masses, organomegaly), percussion (ascites/shifting dullness), bowel sounds, hernial orifices, PR where indicated.
- **Neurological** (Ch 16): higher function/GCS, cranial nerves, motor (tone, power, reflexes, coordination), sensory, gait.
- **Locomotor/MSK** (Ch 15): look–feel–move, GALS screen, joint-specific.
- **Urogenital** (Ch 17), **Endocrine/metabolic** (Ch 18), **Skin/nails/hair** (Ch 19), **Eyes** (Ch 20), **ENT** (Ch 21) — as the presentation directs.
- Examination is **hypothesis-driven** — the history shapes which systems are examined in depth; document positives **and** relevant negatives.

---

## 3. SYNTHESIS — DIFFERENTIAL & INITIAL MANAGEMENT (Hutchison Ch 3)

### 3.1 Summary / problem representation

- A concise synthesis: the salient history + examination distilled into a **problem statement**.

### 3.2 Differential diagnosis

- The **ranked differential** — the most likely diagnosis/diagnoses **and the "must-not-miss"** dangerous ones to exclude, with reasoning.
- A **problem list** (acute + chronic) — feeds the encounter engine's problem list (ICD-10 where codable).

### 3.3 Initial investigations

- The investigations to confirm/refine the differential — bedside, bloods, imaging, special tests — **justified by the differential** (not a blind panel); LOINC-coded where captured.

### 3.4 Initial management plan

- Immediate management, treatment started, referrals, **the disposition** (admit / discharge with follow-up / refer / observe), monitoring plan, and **safety-netting** (what to watch for, when to return).
- Consent + shared decision-making + ethics (Ch 4) throughout; communicate the plan to the patient.

### 3.5 Documentation

- The clerking is **documented** into the encounter (the SOAP-style structure maps: **S**ubjective = history; **O**bjective = examination + investigations; **A**ssessment = differential/diagnoses; **P**lan = investigations + management) — versioned, append-only, cadre-stamped, per the encounter engine.

---

## 4. HOW THE CLERKSHIP MAPS TO THE ENCOUNTER ENGINE (for the build)

- The clerking **populates the encounter engine's objects**, not a parallel store: history+examination → **clinical documentation** (structured, versioned); differential/diagnoses → **diagnoses** + **problem list** (ICD-10); investigations → **orders** + **results** (LOINC); medications/allergies elicited → **medications** + **allergies** (allergies surfaced at prescribing); plan/disposition → **care plan** + the encounter's disposition; everything onto the **encounter timeline**.
- The clerkship flow is a **structured, guided documentation surface** over the engine — extensible (Section 2 particular-group flows + Section 3 system-specific exam templates are later layers).
- **Decision-support, not autonomous:** it structures, prompts, and records; the clinician examines and decides. No auto-diagnosis. (Coded-abnormal flags + must-not-miss prompts are decision-support.)

## 5. WHAT TO BUILD FIRST vs LATER (scope discipline)

- **First (this layer):** the **general adult clerkship** — the full schematic history (§1.1–1.8), the general + system examination capture (§2), and the synthesis (§3) — mapped onto the engine, as a structured documentation flow.
- **Later layers (flag, don't build now):** the **particular-group flows** (paediatric, obstetric/women, older-person/CGA, psychiatric/MSE, emergency-focused, fever, pain — Section 2); **system-specific structured exam templates** (Section 3) with embedded scoring; specialty proformas; templated proformas per presenting complaint.

## 6. SOURCES (cite; verify at build)

**Hutchison's Clinical Methods, 24th ed.** — Section 1 (Ch 1–4), Section 2 (particular groups), Section 3 (system examinations). Calgary–Cambridge consultation guide. SOCRATES (pain), CAGE (alcohol). ICD-10 (diagnoses) + LOINC (investigations) per the encounter engine. Verify current guidance at build; CSO sign-off of the clerking structure + embedded content.
