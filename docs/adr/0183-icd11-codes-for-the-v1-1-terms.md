# ADR 0183 — ICD-11 codes for the REF-DX-TERMS v1.1 terms, read on the WHO API

**Status:** Accepted — 2026-09-28. Signed by the CSO (`docs/emr/clerking-v2/summary-impression/icd11-signoff.md`).
Migration 0086 is GATED and applied by the owner, after 0085. Completes ADR 0182 §1.

## Context

Migration 0085 seeded the 187 terms of the v1.1 addendum uncoded, because the WHO hosts were unreachable and no code
could be verified (D-SI-26). The environment now reaches `icdaccessmanagement.who.int` and `id.who.int`, and the
session holds WHO ICD API credentials. The addendum's own codes (37 proposals, 116 hints) came from search-result
titles on a mirror that were never opened: 43 of 153 differ from what WHO returns, and five do not exist in the release
in force (BB40.Z, BC20.1, 8B11.Z, 8B01.Z, 1D9Z).

## Decision

1. **Codes are read on the WHO ICD-11 API**, MMS release 2026-01 (the release in force). Each term is searched and
   every candidate is re-read as a WHO entity (`codeinfo` → entity), so the code, title and entity uri are WHO's own.
   The API counts as the primary source ("verified" in the v1 legend), not a mirror.
2. **One code per term, a stem code only.** The column holds one code, so where WHO's exact match is a postcoordinated
   cluster (tuberculous pericarditis, oesophageal candidiasis, acute heart failure, acute nephritic syndrome, methanol)
   the stem is written and the cluster is noted. No cluster is stored.
3. **Where WHO's index files the plain "NOS" form of a term under a specific code, that code is used**, and the
   assumption is recorded (deep vein thrombosis → lower limb, acute appendicitis → without peritonitis, bipolar
   disorder → type I, subdural haematoma → traumatic, rhabdomyolysis → idiopathic).
4. **A term with no single honest code stays uncoded (10).** That covers an "or" term whose halves sit in different
   categories with no shared parent, a "suspected" term whose code would record a confirmed disease, and a term that
   WHO's own index maps to two codes: advanced HIV, lung abscess or empyema, megaloblastic and haemolytic anaemia,
   suspected malignancy, oncological emergency, cord or cauda equina compression, pancreatic or biliary cancer,
   angioedema, suicidal thoughts or self-harm. They keep reading "As typed · not coded" and are never HMIS-counted.
5. **The CSO signed 177 codes** (groups A 138, B 34, C 5) with the choices in the record. They are data
   (`data/emr/diagnosis-terms.v1.1-icd11.json`) and generate migration 0086 through `scripts/emr/gen-seed.ts`, with a
   drift test.
6. **0086 sets `icd11_code`, `verified_on` and `source` only**, and only on a row still exactly as 0085 left it (no code,
   never verified). A re-run changes nothing, and a code set since by other means is never overwritten. `source` cites
   the WHO entity uri, as 0072's coded rows cite theirs.
7. **The addendum file is not edited.** 0085 is generated from it and is applied, so its data stays as it was; the codes
   live in their own signed file.

## Consequences

- After 0086, the 177 terms show their code on the desk and in the chart (`verified_on` is set) and count towards HMIS
  once REF-HMIS-MAP is signed. A condition recorded before 0086 keeps the code it was written with (none), because a
  condition copies its term's code when it is written.
- Two pairs of terms share a stem because the substance is not held: organophosphate and methanol (NE61), paracetamol
  and opioid or sedative toxicity (NE60). Postcoordination would separate them; it is not supported yet.
- The held terms could be split into single-concept terms (lung abscess / empyema, pancreatic / biliary cancer,
  suicidal thoughts / self-harm) in a later catalogue change.
- REF-DX-TERMS v1.0's 85 codes are still `verified-mirror` (findacode, 2026-09-26). The same API run can confirm them
  against WHO. That work is not done here.
- The WHO hosts must stay allowed in the environment's network access for any later verification.

## Alternatives considered

- **Write the addendum's proposed codes.** Rejected: unverified, 43 of 153 are wrong or absent, and ADR 0182 forbids it.
- **Store postcoordinated clusters (`1B12.0&XA2XU0`).** Rejected for now: one text column, and no reader or HMIS mapping
  understands clusters. Stems are correct, only less specific.
- **Code every term, using the nearest parent or residual.** Rejected for the 10 held terms: a code that asserts more
  than the clinician knows (acquired haemolysis, confirmed cancer, a stage of HIV) is worse than none.
