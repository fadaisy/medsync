# CFC v1.2 addendum — clerking v2 findings (PROPOSED, for CSO signature)

**Why:** a clerking finding becomes a charted fact only through a CFC concept. The CFC has 35 finding concepts, so 12 of the catalogue's 96 symptoms chart today. The other 84 are kept in the signed note with their catalogue ids, which is correct but not charted, so the chart, engines and exports cannot read them.

**Proposal** (`cfc-v1.2-proposal.json`, generated from the catalogue, 84 concepts):

- **Findings:** one presence finding concept per remaining symptom, `sx.<symptom>`.
  - The display and synonyms are the catalogue's.
  - `symptomCode` points at the shared vocabulary token.
  - Sensitivity follows the catalogue: restricted for the HIV, TB, mental-health and sexual and reproductive health classes.
  - Qualifiers stay the catalogue's option ids, in the fact context.
- **Social history:**
  - `soc.tobacco_pack_years`: a quantity, derived and never typed;
  - `soc.alcohol_pattern`: coded, the catalogue's pattern ids.

  `soc.alcohol` (within or above limits) is not used, because the form does not ask for units.

**To adopt:**

1. The CSO signs the proposal, editing or withholding any concept.
2. It is added to the CFC catalogue source, and `lib/facts/catalogue.generated.ts` is regenerated.
3. A GATED seed migration adds the rows to `clinical_concepts`, in the style of 0072.

From then on, signing a v2 note charts every answered symptom. No desk code changes: the token map already points at the tokens.
