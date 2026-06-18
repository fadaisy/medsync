# DDx weights — sourced per-complaint differential (weight + EXPAND)

This folder holds the **cited, CSO-signable** per-complaint files that turn the
clerkship agent's flat differential into a ranked, demographics-aware, narrowing
one — AND **broaden** each complaint's differential beyond the maps' original set
(spec: `docs/superpowers/specs/2026-06-17-smart-differential-design.md`,
context: [[project_clerkship_agent]]).

A sourced file does two things:

1. **Overlays weights** on the complaint's EXISTING differentials (basePrior, age/sex
   priors, feature/risk weights) — sharpening the ranking.
2. **Appends NEW diagnoses** to the complaint (a full entry: name + likelihood +
   weights + optional criteria) — a comprehensive, Uganda-relevant working
   differential (typically ~10–15 dx per complaint).

**Bootstrap vs enrichment.** Until a complaint has a file here, the engine derives
weights from the CSO-approved maps (`ruleIn → +3`, `ruleOut → −3`, `supporting/refuting
→ ±1`, `risk → +1`, `likelihood → must-not-miss flag + coarse base prior`) and shows
only the maps' original dx. **No age/sex prior and no extra diagnoses are invented** —
both arrive only via a sourced, cited file here.

**Gating + safety.** New diagnoses + overlaid weights are **ranked-mode only**
(`packs.rankedMaps`), behind `AGENT_DDX_RANKING_CSO_SIGNED` (needs `CLERKSHIP_AGENT_LIVE=1`).
**Flat mode and every other reducer use the untouched approved maps** — so a file here
adds NOTHING to prod until the flag is on and the CSO has signed the file. Adding a
diagnosis is net-new clinical content: it must be cited and CSO-reviewed.

---

## File format

One file per complaint: `<complaint_code>.json`. `complaint` = the complaint code.
Each entry in `weights` is matched to an existing differential by `dx` name (exact)
or `dxCode`; an entry that matches **nothing** is **appended as a new diagnosis**.

```jsonc
{
  "complaint": "chest_pain",
  "source_version": "2026-06-17",
  "weights": [
    // ── OVERLAY on an existing dx: use the EXACT map name; weight fields only. ──
    {
      "dx": "Acute coronary syndrome / MI",
      "basePrior": 3,
      "agePrior": [
        { "minAge": 50, "delta": 2 },
        { "maxAge": 39, "delta": -2 },
      ],
      "sexPrior": { "male": 1 },
      "featureWeights": { "Exertional": 3, "Crushing": 2, "Reproducible on palpation": -4 },
      "riskWeights": { "hypertension": 1, "diabetes mellitus": 1, "smoking": 1 },
      "confidence": "high",
      "needsCsoInput": false,
      "weightCitation": "ESC 2023 ACS; Uganda Clinical Guidelines 2023",
    },
    // ── NEW dx (appended): a clear new name + likelihood + weights + optional criteria. ──
    {
      "dx": "Community-acquired pneumonia",
      "likelihood": "likely", // must_not_miss | likely | less_likely (drives base prior + the must-not-miss pin)
      "basePrior": 2,
      "agePrior": [{ "minAge": 65, "delta": 1 }],
      "sexPrior": {},
      "featureWeights": { "Pleuritic": 2, "fever": 2, "sputum": 2, "cough": 1 },
      "riskWeights": { "HIV": 1, "COPD": 1 },
      "ruleIn": ["Pleuritic"],
      "ruleOut": [],
      "supportingSymptoms": ["fever", "sputum", "cough"],
      "refutingSymptoms": [],
      "confidence": "high",
      "needsCsoInput": false,
      "weightCitation": "BTS CAP 2009/2015; Uganda Clinical Guidelines 2023 (pneumonia)",
    },
  ],
}
```

- **Existing dx** entries need only the weight fields (`likelihood`/`ruleIn` are ignored — the
  approved differential keeps its own).
- **New dx** entries need `likelihood` (sets the must-not-miss pin + base prior) and should carry
  `featureWeights`/`riskWeights` that drive scoring; `ruleIn/ruleOut/supportingSymptoms/refutingSymptoms`
  are optional and stored for the record (strings; the engine wraps them).
- **No `dxCode` needed** — identity is by exact dx name (consistent across complaints, so a shared dx
  like Pulmonary embolism still reinforces). Add a `dxCode` only if you want an explicit stable id.

### Scale (keep commensurate with the bootstrap + tiers)

- `basePrior` 0–4 (common-given-complaint 3–4, uncommon 0–1). `featureWeights` strong rule-in +3..+4,
  supportive +1..+2, strong-against −3..−4, mild −1..−2. `riskWeights` +1 (dominant +2). age/sex deltas −3..+3.
- Tiers (`lib/clerkship/agent/weights.ts`): Leading ≥5, Worth-considering ≥2, Less-likely ≥0, else ruled-down.
  These are **calibration constants** — tune after the first 1–2 complaints.

---

## Feature / risk vocabulary (prefer these tokens so criteria FIRE)

For `featureWeights`/`riskWeights` keys, **reuse these existing tokens** wherever clinically applicable
(they are what the clerkship actually captures, so they move the ranking). You may introduce a NEW token
when none fits — but set `needsCsoInput: true` and note it (a brand-new feature only fires once the capture
catalog supports it; until then the dx still ranks on base prior + age/sex).

**Character / exam features (107):** Acid taste, Acute, Aura, Band-like, Bilateral, Burning, Burning postprandial,
Colicky, Constant, Crushing, Dry, Epigastric, Exertional, Gradual, Haematemesis, Haemoptysis, Maximal at onset,
Melaena, Migratory, Orthopnoea, Painless, Paroxysmal nocturnal dyspnoea, Photophobia, Pleuritic, Postprandial,
Radiation to back, Radiation to jaw, Radiation to left arm, Relieved sitting forward, Reproducible on palpation,
Sharp, Sudden, Tearing, Thunderclap, Throbbing, Unequal pulses, Unilateral, Wheeze, Worse lying flat … (full set in the maps).

**Associated symptoms (50):** abdominal pain, anxiety, appetite loss, change in bowel habit, chest pain, cough,
dyspnoea, dysuria, fatigue, fever, haemoptysis, headache, heartburn, jaundice, joint pain, leg swelling,
nausea/vomiting, night sweats, pallor, palpitations, sputum, syncope, visual disturbance, weakness, weight loss, wheeze.

**Risk / background (79):** HIV, TB / TB contact, COPD, asthma, alcohol, cancer, diabetes mellitus, hypertension,
hyperlipidaemia, ischaemic heart disease, heart failure, atrial fibrillation, rheumatic heart disease,
sickle-cell disease, smoking, malaria / malaria-endemic residence, recent immobility or surgery, prior VTE,
oestrogen / pregnancy, NSAID use, peptic ulcer disease, chronic kidney disease, liver disease.

---

## Research-prompt template (paste into web-enabled Claude, one complaint at a time)

Replace `{{COMPLAINT}}` + paste the complaint's existing differential (names + tokens) from
`enriched-reasoning-maps.json`, and paste the vocabulary above. Ask for the COMPLETE differential
(existing re-weighted **+** new Uganda-relevant dx, ~10–15 total), cited, on the stated scales,
returning the JSON shape above. (The controller will generate the fully-populated prompt per complaint.)

Core instructions to include: WHO/Uganda-first then textbooks/society guidelines; per-dx basePrior
(frequency, not danger), agePrior, sexPrior, featureWeights (reuse vocabulary tokens), riskWeights,
likelihood, confidence, needsCsoInput, weightCitation; NO fabrication (omit + flag when unsourced);
prefer the vocabulary tokens; mark which dx are NEW.

---

## Wiring a returned file (per chunk)

1. Save as `docs/clinical/agent/ddx-weights/<complaint_code>.json`.
2. In `lib/clerkship/agent/packs.ts`, add the import + array entry:

   ```ts
   import chestPainWeights from "@/docs/clinical/agent/ddx-weights/chest_pain.json";

   const DDX_WEIGHT_FILES: DdxWeightFile[] = [chestPainWeights as unknown as DdxWeightFile];
   ```

3. `npx vitest run tests/clerkship/agent/ddx-weights-coverage.test.ts` (entries resolve; no dup identity).
4. Smoke: `CLERKSHIP_AGENT_LIVE=1 ENCOUNTER_ENGINE_LIVE=1 AGENT_DDX_RANKING_CSO_SIGNED=1 npm run dev`.
5. CSO reviews the file (every new dx + every `needsCsoInput: true`). Going live is the flag, already on.

## The 17 complaints (codes)

`chest_pain · dyspnoea · headache · abdominal_pain · palpitations · syncope · fever ·
dizziness · cough · jaundice · gi_bleeding · oedema · joint_pain · confusion ·
focal_weakness · weight_loss · fatigue`
