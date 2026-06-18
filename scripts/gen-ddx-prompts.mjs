/* eslint-disable no-console */
/**
 * Generate the per-complaint DDx-weight research prompts (one .md per complaint)
 * from the CSO-approved reasoning maps + the firing vocabulary. Deterministic —
 * re-run after editing the template or the maps. Output:
 *   docs/clinical/agent/ddx-weights/prompts/<complaint_code>.md
 * Usage: node scripts/gen-ddx-prompts.mjs   (regenerates all 17; chest_pain too)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const maps = JSON.parse(
  readFileSync(new URL("../docs/clinical/enriched-reasoning-maps.json", import.meta.url), "utf8"),
);

const clean = (s) => s.replace(/[«»]/g, "");
const uniqSorted = (set) => [...set].map(clean).sort((a, b) => a.localeCompare(b));

// Firing vocabulary — union across all maps (what the clerkship actually captures).
const feat = new Set(),
  sym = new Set(),
  risk = new Set();
for (const m of maps)
  for (const d of m.differential) {
    (d.ruleIn ?? []).forEach((t) => feat.add(t));
    (d.ruleOut ?? []).forEach((t) => feat.add(t));
    (d.riskFactors ?? []).forEach((t) => risk.add(t));
    (d.supportingSymptoms ?? []).forEach((s) => sym.add(s.symptom));
    (d.refutingSymptoms ?? []).forEach((s) => sym.add(s.symptom));
  }
const VOCAB = {
  feature: uniqSorted(feat),
  symptom: uniqSorted(sym),
  risk: uniqSorted(risk),
};

function differentialBlock(m) {
  return m.differential
    .map((d, i) => {
      const parts = [
        d.ruleIn?.length ? `ruleIn: ${d.ruleIn.map(clean).join(", ")}` : "",
        d.ruleOut?.length ? `ruleOut: ${d.ruleOut.map(clean).join(", ")}` : "",
        d.supportingSymptoms?.length
          ? `supporting: ${d.supportingSymptoms.map((s) => clean(s.symptom)).join(", ")}`
          : "",
        d.refutingSymptoms?.length
          ? `refuting: ${d.refutingSymptoms.map((s) => clean(s.symptom)).join(", ")}`
          : "",
        d.riskFactors?.length ? `risk: ${d.riskFactors.map(clean).join(", ")}` : "",
      ].filter(Boolean);
      return `${i + 1}. "${d.dx}" (${d.likelihood}) — ${parts.join("; ")}`;
    })
    .join("\n");
}

function promptFor(m) {
  const name = m.display;
  return `Research prompt — ${name} (complaint code: ${m.code})
Paste the whole block below into a web-enabled Claude session (turn web search ON), then
send the returned JSON back to be wired as a sourced chunk. Weights are cited + CSO-reviewed.

────────────────────────────────────────────────────────────────────────────
You are a clinical-reasoning evidence assembler for a Ugandan internal-medicine EMR
(national-referral scale, e.g. Mulago). Build the COMPLETE, ranked-ready differential for
the presenting complaint "${name}" (complaint code: ${m.code}) — both (A) re-weight the
EXISTING diagnoses and (B) ADD the other diagnoses a good IM physician carries for this
complaint in this setting. Aim for ~12–15 diagnoses total (comprehensive, not zebra-clutter).

EXISTING diagnoses (keep these EXACT names; mark "new": false):
${differentialBlock(m)}

ADD new diagnoses (mark "new": true) clinically warranted for a Ugandan adult IM population
(consider TB, HIV-related disease, malaria, rheumatic heart disease, sickle-cell, and other
locally prevalent causes where relevant to this complaint). Use clinical + epidemiological
judgement; do not pad with rarities.

REUSE these capture tokens for featureWeights / riskWeights keys wherever applicable (these
are what the EMR captures, so they move the ranking). Introduce a new token only if none
fits, and then set needsCsoInput: true with a note.
• Features: ${VOCAB.feature.join(", ")}
• Associated symptoms: ${VOCAB.symptom.join(", ")}
• Risk / background: ${VOCAB.risk.join(", ")}

For EACH diagnosis (existing + new), grounded ONLY in NAMED, citable sources — prefer
WHO / Uganda Clinical Guidelines / Uganda MoH first, then textbooks (Hutchison's, Macleod's,
Davidson's, Harrison's) and society guidelines. NEVER state a value without a source.
- new: true|false
- likelihood: "must_not_miss" | "likely" | "less_likely"
- basePrior: 0–4 integer = FREQUENCY among adults presenting with ${name.toLowerCase()} at a
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
{ "complaint": "${m.code}", "source_version": "<today's date>", "weights": [ { "dx": "...", "new": false, "likelihood": "...", "basePrior": 0, "agePrior": [], "sexPrior": {}, "featureWeights": {}, "riskWeights": {}, "confidence": "high", "needsCsoInput": false, "weightCitation": "..." } ] }
────────────────────────────────────────────────────────────────────────────
`;
}

const outDir = new URL("../docs/clinical/agent/ddx-weights/prompts/", import.meta.url);
mkdirSync(outDir, { recursive: true });
let n = 0;
for (const m of maps) {
  writeFileSync(new URL(`${m.code}.md`, outDir), promptFor(m), "utf8");
  n++;
  console.log(`wrote prompts/${m.code}.md`);
}
console.log(`\n${n} prompts generated.`);
