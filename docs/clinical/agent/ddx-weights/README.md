# DDx weights — sourced per-complaint differential weighting

This folder holds the **cited, CSO-signable** weighting that turns the clerkship
agent's flat differential into a ranked, demographics-aware, narrowing one
(spec: `docs/superpowers/specs/2026-06-17-smart-differential-design.md`,
ADR-context: [[project_clerkship_agent]]).

**Bootstrap vs enrichment.** Until a complaint has a file here, the engine
**derives** weights from the already-CSO-approved maps
(`docs/clinical/enriched-reasoning-maps.json`): `ruleIn → +3`, `supporting → +1`,
`ruleOut → −3`, `refuting → −1`, `riskFactors → +1`, `likelihood → must-not-miss
flag + a coarse base prior`. **No age/sex prior is invented** — demographics are
plumbed but neutral until you source them here. A file in this folder **replaces**
the derived defaults for that complaint (per category).

**Gating.** The whole ranked behaviour is dark behind `AGENT_DDX_RANKING_CSO_SIGNED`
(needs `CLERKSHIP_AGENT_LIVE=1`). A file here changes nothing in prod until the
CSO turns that flag on.

---

## File format

One file per complaint: `<complaint_code>.json`. The `<complaint_code>` and each
`dx` (or `dxCode`) **must already exist** in `enriched-reasoning-maps.json` for
that complaint — weights attach to existing differentials, they do not create new
diagnoses. (The coverage test `tests/clerkship/agent/ddx-weights-coverage.test.ts`
guards this once the file is wired in.)

```jsonc
{
  "complaint": "chest_pain",
  "source_version": "2026-06-17",
  "weights": [
    {
      "dx": "Acute coronary syndrome / MI", // must match the map's differential dx (or set dxCode)
      "dxCode": "acs", // optional stable id (recommended for cross-complaint dx like PE)
      "basePrior": 2, // baseline FREQUENCY given this complaint (NOT danger). int, ~0–4
      "agePrior": [
        // age bands; deltas of ALL matching bands are summed
        { "minAge": 50, "delta": 2 },
        { "maxAge": 39, "delta": -2 },
      ],
      "sexPrior": { "male": 1 }, // delta by patient_profiles.sex value (male|female|intersex|prefer_not_say)
      "featureWeights": {
        // token → signed weight. tokens = the SAME prose used in the map's
        "Exertional": 3, //   ruleIn/ruleOut (alias-matched), e.g. "Crushing", "Pleuritic".
        "Crushing": 2, //   positive = supports, negative = argues against.
        "Reproducible on palpation": -4,
      },
      "riskWeights": {
        // background/PMH token → positive weight
        "hypertension": 1,
        "diabetes mellitus": 1,
        "smoking": 1,
      },
      "confidence": "high", // high | moderate | low
      "needsCsoInput": false, // true where the evidence is thin / locally contested
      "weightCitation": "Author/Guideline, year, section — what it supports",
    },
  ],
}
```

### Scale (keep weights commensurate with the bootstrap)

- `basePrior`: common-given-complaint ≈ 2–3; uncommon ≈ 0–1.
- `featureWeights`: a strong rule-in feature ≈ +3..+4; a supportive one ≈ +1..+2; a
  strong argues-against ≈ −3..−4; a mild one ≈ −1..−2.
- `riskWeights`: ≈ +1 each (a dominant risk ≈ +2).
- `agePrior`/`sexPrior` deltas: typically −3..+3.
- Tier thresholds (in `lib/clerkship/agent/weights.ts`): Leading ≥ 5, Worth-considering ≥ 2,
  Less-likely ≥ 0, below 0 = ruled-down. These are **calibration constants** — tune after the first 1–2 complaints.

---

## Research-prompt template (paste into web-enabled Claude, one complaint at a time)

> Replace `{{COMPLAINT}}` and paste the differential list for that complaint from
> `enriched-reasoning-maps.json` (the `dx` + `ruleIn`/`ruleOut`/`riskFactors` arrays)
> so the weights attach to the real diagnoses and reuse the real feature tokens.

```
You are a clinical-reasoning evidence assembler for a Ugandan internal-medicine EMR
(national-referral scale). I need CITED weighting to rank the differential for the
presenting complaint "{{COMPLAINT}}".

Here are the existing differentials and their feature/risk tokens (use these EXACT
diagnosis names and these EXACT feature/risk token strings — do not rename them):
{{PASTE the complaint's differential array from enriched-reasoning-maps.json}}

For EACH diagnosis, give, grounded ONLY in named, citable sources (prefer
WHO / Uganda Clinical Guidelines / Uganda MoH first, then major textbooks —
Hutchison's, Macleod's, Davidson's, Harrison's — and society guidelines; NEVER
from your own memory without a source):

1. basePrior: baseline FREQUENCY of this dx among patients presenting with
   "{{COMPLAINT}}" at a Ugandan referral hospital (NOT how dangerous it is),
   on a 0–4 integer scale (3–4 = common, 0–1 = uncommon).
2. agePrior: age bands that raise/lower it, as [{minAge?,maxAge?,delta}] with deltas
   in −3..+3 (e.g. ACS rises with age; gives realistic Ugandan epidemiology where it
   differs from Western data — e.g. RHD, TB, HIV-related disease are younger/commoner).
3. sexPrior: {male?,female?} deltas in −3..+3 where sex genuinely shifts probability.
4. featureWeights: for each ruleIn/ruleOut token above, a signed weight
   (+3..+4 strong rule-in, +1..+2 supportive, −3..−4 strong against, −1..−2 mild).
   Only weight the tokens given; do not invent new features here.
5. riskWeights: for each riskFactor token above, a positive weight (+1, or +2 if dominant).
6. confidence: high | moderate | low, per diagnosis.
7. needsCsoInput: true where evidence is thin, Western-vs-Uganda data conflict, or you
   are extrapolating — and say why in one line.
8. citation: the specific source (author/guideline, year, chapter/section) for the
   above. One per dx minimum; cite the strongest claim.

HARD RULES: no fabrication; if you cannot find a source for a value, omit it (the
engine falls back to the approved-map default) and set needsCsoInput=true with a note.
Do not add diagnoses beyond the list. Keep weights on the stated scales.

Return ONLY valid JSON in this exact shape:
{ "complaint": "{{COMPLAINT}}", "source_version": "<today>", "weights": [ { ...as above... } ] }
```

---

## Wiring a returned file (per chunk)

1. Save the JSON as `docs/clinical/agent/ddx-weights/<complaint_code>.json`.
2. In `lib/clerkship/agent/packs.ts`, add the import and the array entry:

   ```ts
   import chestPainWeights from "@/docs/clinical/agent/ddx-weights/chest_pain.json";

   const DDX_WEIGHT_FILES: DdxWeightFile[] = [chestPainWeights as DdxWeightFile];
   ```

3. Run `npx vitest run tests/clerkship/agent/ddx-weights-coverage.test.ts` — every
   entry must resolve to a real differential (catches typos / renamed dx).
4. Smoke-test locally with the flag on:
   `CLERKSHIP_AGENT_LIVE=1 ENCOUNTER_ENGINE_LIVE=1 AGENT_DDX_RANKING_CSO_SIGNED=1 npm run dev`.
5. CSO reviews the file (esp. every `needsCsoInput: true`). Going live is a separate,
   deliberate flag flip — per complaint or all at once.

## The 17 complaints (codes)

`chest_pain · dyspnoea · headache · abdominal_pain · palpitations · syncope · fever ·
dizziness · cough · jaundice · gi_bleeding · oedema · joint_pain · confusion ·
focal_weakness · weight_loss · fatigue`
