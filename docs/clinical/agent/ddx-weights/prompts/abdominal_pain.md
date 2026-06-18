Research prompt — Abdominal pain (complaint code: abdominal_pain)
Paste the whole block below into a web-enabled Claude session (turn web search ON), then
send the returned JSON back to be wired as a sourced chunk. Weights are cited + CSO-reviewed.

────────────────────────────────────────────────────────────────────────────
You are a clinical-reasoning evidence assembler for a Ugandan internal-medicine EMR
(national-referral scale, e.g. Mulago). Build the COMPLETE, ranked-ready differential for
the presenting complaint "Abdominal pain" (complaint code: abdominal_pain) — both (A) re-weight the
EXISTING diagnoses and (B) ADD the other diagnoses a good IM physician carries for this
complaint in this setting. Aim for ~12–15 diagnoses total (comprehensive, not zebra-clutter).

EXISTING diagnoses (keep these EXACT names; mark "new": false):

1. "Ruptured abdominal aortic aneurysm" (must_not_miss) — ruleIn: Sudden, Radiation to back, Tearing; supporting: syncope; risk: hypertension, smoking, age over 60 male
2. "Perforation / peritonitis" (must_not_miss) — ruleIn: Sudden, Constant, Worse on movement; ruleOut: Colicky; supporting: fever, nausea/vomiting; risk: peptic ulcer disease, NSAID use
3. "Bowel obstruction / ischaemia" (must_not_miss) — ruleIn: Colicky; supporting: nausea/vomiting, abdominal distension, change in bowel habit; risk: prior abdominal surgery, atrial fibrillation
4. "Ectopic pregnancy" (must_not_miss) — ruleIn: Sudden; supporting: vaginal/urethral discharge, syncope; risk: reproductive-age woman, missed period, prior PID / ectopic
5. "Acute pancreatitis" (likely) — ruleIn: Radiation to back, Epigastric, Constant; supporting: nausea/vomiting; risk: alcohol, gallstones
6. "Appendicitis" (likely) — ruleIn: Right iliac fossa, Migrated from umbilicus; supporting: fever, appetite loss
7. "Inferior MI (epigastric)" (must_not_miss) — ruleIn: Epigastric, Exertional; ruleOut: Worse on movement; supporting: dyspnoea; risk: diabetes mellitus, ischaemic heart disease, hypertension

ADD new diagnoses (mark "new": true) clinically warranted for a Ugandan adult IM population
(consider TB, HIV-related disease, malaria, rheumatic heart disease, sickle-cell, and other
locally prevalent causes where relevant to this complaint). Use clinical + epidemiological
judgement; do not pad with rarities.

REUSE these capture tokens for featureWeights / riskWeights keys wherever applicable (these
are what the EMR captures, so they move the ranking). Introduce a new token only if none
fits, and then set needsCsoInput: true with a note.
• Features: Acid taste, Acute, Acute and painful, Acute under 3 weeks, Aura, Band-like, Bilateral, Brief stiffness, Burning, Burning postprandial, Chronic over 3 weeks, Colicky, Constant, Continuous, Crushing, Dry, Epigastric, Exertional, Exertional, Exertional only, Facial / periorbital, Fluctuating, Fresh red PR bleeding, Gradual, Gradual, Gradual over weeks, Haematemesis, Haemoptysis, Incontinence, Increased appetite, Irregularly irregular, Isolated facial (forehead involved), Light-headed / faint type, Maximal at onset, Melaena, Mental more than physical, Migrated from umbilicus, Migratory, Morning stiffness over 30 min, New headache age over 50, No prodrome, On standing, Orthopnoea, Painless, Pale stools / dark urine, Paroxysmal nocturnal dyspnoea, Persistent, Photophobia, Pleuritic, Postprandial, Preceding seizure, Prodrome nausea/warmth, Prolonged fever, Prolonged post-event confusion, Prolonged standing trigger, Radiation to back, Radiation to jaw, Radiation to left arm, Rapid recovery, Red and warm, Reduced appetite, Regular fast, Relapsing / tertian pattern, Relieved sitting forward, Reproducible on palpation, Reproducible on palpation, Right iliac fossa, Right upper quadrant pain, Rigors, Same as usual headache, Sharp, Single hot swollen joint, Single joint, Single skipped beats, Situational, Speech disturbance, Sudden, Sudden, Sudden onset, Sudden onset and offset, Supine, Symmetrical small joints, Tearing, Tearing or ripping, Temporal, Throbbing, Thunderclap, Tongue-biting, Triggered by head movement, brief, True spinning, Unequal pulses, Unilateral, Unilateral face/arm/leg, Wheeze, With chest pain, With dizziness/syncope, With exertion, With fever, With focal neuro symptoms, With syncope, Worse in evening, Worse lying flat, Worse on coughing/bending, Worse on movement, Worse on waking, Worse with fever, Worse with use
• Associated symptoms: abdominal distension, abdominal pain, anxiety, appetite loss, change in bowel habit, chest pain, cold intolerance, cough, dyspnoea, dysuria, easy bruising/bleeding, exertional dyspnoea, fatigue, fever, frothy urine, haematemesis, haemoptysis, headache, hearing loss, heartburn, heat intolerance, jaundice, joint pain, leg swelling, low mood, lymphadenopathy, memory/cognitive change, nausea/vomiting, night sweats, orthopnoea, pallor, palpitations, paroxysmal nocturnal dyspnoea, pleuritic chest pain, polyuria/polydipsia, pruritus, rash, recurrent infections, seizures, sore throat/hoarseness, speech disturbance, sputum, syncope, tremor, urinary frequency, vaginal/urethral discharge, visual disturbance, weakness, weight loss, wheeze
• Risk / background: age, age over 50, age over 60 male, alcohol, anticoagulant, antihypertensives, aortic stenosis, asthma, atrial fibrillation, bleeding disorder, caffeine / stimulants, calcium-channel blocker, cancer, cardiomyopathy, chest trauma, chronic kidney disease, COPD, depression/anxiety, diabetes mellitus, epilepsy, family bowel cancer, family cancer history, family history premature cardiac death, family history SAH, family history sudden death, gallstones, GI blood loss, gout, heart failure, heavy menstrual bleeding, hepatitis B/C, high-risk exposure, HIV, hyperlipidaemia, hypertension, immunosuppression, indwelling device, insulin / sulfonylurea, ischaemic heart disease, IV drug use, known migraine, liver disease, malaria, malaria-endemic residence/travel, Marfan / connective tissue disease, missed period, NSAID / anticoagulant use, NSAID use, obesity, oestrogen / pregnancy, opioids / sedatives, paracetamol overdose, peptic ulcer disease, polycystic kidney disease, polymyalgia rheumatica, prior abdominal surgery, prior aortic graft, prior PID / ectopic, prior VTE, prosthetic joint, prosthetic valve, recent immobility or surgery, recent sore throat, recent strain or trauma, recent viral illness, reproductive-age woman, rheumatic heart disease, rheumatoid arthritis, sickle-cell disease, skin breach, smoking, stress, stroke/TIA, tall thin young male, TB contact, thyroid disease, tuberculosis, volume depletion, WPW

For EACH diagnosis (existing + new), grounded ONLY in NAMED, citable sources — prefer
WHO / Uganda Clinical Guidelines / Uganda MoH first, then textbooks (Hutchison's, Macleod's,
Davidson's, Harrison's) and society guidelines. NEVER state a value without a source.

- new: true|false
- likelihood: "must_not_miss" | "likely" | "less_likely"
- basePrior: 0–4 integer = FREQUENCY among adults presenting with abdominal pain at a
  Ugandan referral hospital (NOT how dangerous it is). Note where Ugandan epidemiology differs.
- agePrior: [{minAge?, maxAge?, delta}], deltas −3..+3
- sexPrior: {"male"?: delta, "female"?: delta}, deltas −3..+3, only where sex genuinely shifts it
- featureWeights: signed weight per relevant feature token (strong rule-in +3..+4, supportive
  +1..+2, strong-against −3..−4, mild −1..−2). Weight the listed tokens for existing dx; for new
  dx weight its key discriminators.
- riskWeights: +1 per relevant risk token (+2 if dominant)
- pinWhen (OPTIONAL, must_not_miss only): for a CONDITIONAL must-not-miss — one that is only a
  "don't forget" when a specific risk/feature is present (e.g. sickle-cell acute chest syndrome
  → only in sickle-cell disease; malaria → only with malaria-endemic exposure) — set
  {"riskAny": ["<token>"]} and/or {"featureAny": ["<token>"]}. Omit for unconditional
  must-not-miss (those pin for everyone).
- confidence: "high" | "moderate" | "low"
- needsCsoInput: true where evidence is thin / Western-vs-Uganda conflict / extrapolating (+ a one-line why)
- weightCitation: the specific source(s) (author/guideline, year, section)
- new dx ONLY: optionally include ruleIn / ruleOut / supportingSymptoms / refutingSymptoms as string arrays

HARD RULES: no fabrication — if you can't source a value, OMIT that field and set
needsCsoInput=true with a note. Use the cleaned token wording shown (no « » markers). Keep
weights on the stated scales. Do NOT add a dxCode. Keep total ~12–15 dx.

Return ONLY valid JSON, exactly this shape:
{ "complaint": "abdominal_pain", "source_version": "<today's date>", "weights": [ { "dx": "...", "new": false, "likelihood": "...", "basePrior": 0, "agePrior": [], "sexPrior": {}, "featureWeights": {}, "riskWeights": {}, "confidence": "high", "needsCsoInput": false, "weightCitation": "..." } ] }
────────────────────────────────────────────────────────────────────────────
