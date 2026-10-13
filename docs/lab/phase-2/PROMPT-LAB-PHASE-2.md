# PROMPT: Lab Phase 2 — the complete catalogue (every parameter, reference ranges and decision limits, analyser profiles)

> **For Claude Code.** Work on branch `feat/lab-catalogue`, cut from `origin/main` after Lab Phase 1 merged (PR #227). This prompt lives at `docs/lab/phase-2/`.
>
> **Mode:** gated, like Phase 1. Eight steps (0–7), each ending in a **STOP** with a report appended to `docs/lab/phase-2/STOP-REPORTS.md`. Documents: draft → critique → revise (at most two passes) → present → STOP. Code: build → real checks → fix → green → report numbers → STOP. One local commit per step; never push without asking.
>
> **The CSO is Fadhul.** Nothing here reaches a hospital until he signs: the concept addendum, every range a hospital uses (with its laboratory lead), and any wording a clinician reads beside a result.
>
> **Numbers:** migrations **0107–0119** and ADRs **0251–0259** (the lab's claimed block in `docs/NUMBERS.md`). Mark what you use there.

---

## 0. What we are building, in one paragraph

Phase 1 gave each test a fixed unit and a signed range, but the catalogue itself is thin: the full blood count has 6 of the 27 parameters the Mulago analyser prints, and every limit is forced into a low/high reference band. This slice completes the catalogue from the researched proposal (`docs/lab/catalogue-research/`) and the owner's 25 decisions (`DECISIONS.md`). **Every test carries every parameter a Ugandan lab reports, each analyser has a profile, and each result is read against the right kind of limit:** a population reference interval, or a named clinical decision scheme (anaemia, diabetes, lipid categories, CKD stages, viral-load suppression, CD4 categories). Researched ranges arrive in each hospital as **unsigned drafts with their sources**; nothing fires until the laboratory lead and the CSO sign.

**Done when:** a Dymind DH-615 full blood count can be entered with all 27 parameters; a 3-part analyser's MID and GRAN never appear as neutrophils; a woman's haemoglobin is flagged against the WHO 2024 anaemia scheme adjusted for her facility's altitude; and a hospital can import the researched drafts, review them, and sign the ones it verifies.

---

## 1. Ground truth and reading order

1. **The repo wins.** Report every disagreement at STOP 0.
2. **The decisions:** `docs/lab/catalogue-research/DECISIONS.md` (all 25, owner-signed 12 Oct 2026). They are inputs, not suggestions.
3. **The research:** `docs/lab/catalogue-research/lab-catalogue-research.v1.json` (119 concepts, 33 tests, 64 range sets, 497 bands, gaps, sources) and `RESEARCH-NOTES.md`. It is a **proposal**: every value carries its source and confidence; treat it as data to import, never as numbers to type into code.
4. **Phase 1:** `docs/lab/phase-1/PROMPT-LAB-PHASE-1.md` (laws, the measures and ranges model, signing), its ADRs 0239–0250, `lib/lab/{catalogue,ranges,flags,units,limits,measures-setup}.ts`, `app/lab/setup/**`.
5. **The concept registry:** `data/emr/clinical-fact-concepts.v1.*.json`, `data/emr/test-catalogue.v1.json`, `scripts/emr/gen-seed.ts` and the CFC addendum precedent (0082/0083, 0085/0086): new concepts arrive as a signed data file plus a generated migration.

---

## 2. Laws (Phase 1's laws stand; these add to them)

1. **No remembered numbers.** Ranges, decision limits, cut-offs and conversion factors come only from the research file or a hospital's own entry, each with a source. Nothing clinical in code, seeds or copy. Tests use invented values named as fixtures.
2. **Drafts until signed.** An imported range is a draft. It never flags until the laboratory lead and the CSO sign it in Reference ranges (Phase 1's two-signature rule). A band marked `verification` in the research cannot be signed until a person clears it.
3. **Reference is not decision.** A reference interval says "outside the healthy population"; a decision scheme says "this clinical category". They are different records, shown in different words, and a hospital chooses per concept which one drives the H/L flag (CD-01).
4. **A value's basis is part of the value.** Analyser profile, method (creatinine Jaffe or enzymatic), kit and lot, and unit basis (D-dimer FEU or DDU) are stored with the result. A range or scheme applies only to results with a matching basis.
5. **Nothing converts silently.** Plain-factor units may be accepted at entry only where the research gives the factor and Phase 1 allows it; affine conversions (HbA1c IFCC) are display-only (CD-04).
6. **Never borrow across populations by default.** No adult range for a child, no Western range where an African one exists unless the hospital chooses it; a neonate with no source shows "No reference interval for this age", never a guess.
7. **Restricted classes** (CD-08): hiv, tb and sexual_reproductive_health results follow Phase 1 Law 12.
8. Behind a per-hospital flag `labCatalogueV2`, off by default; with it off, Phase 1 behaviour is unchanged.

---

## 3. The decisions in force (summary; `DECISIONS.md` is authoritative)

| Id    | In one line                                                                                                                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-1   | Units stay valid UCUM: `{copies}/mL`, `m[IU]/L`, `mL/min/{1.73_m2}`, `{count}`.                                                                                                                         |
| F-2   | Of the four signed-unit changes, only D-dimer changes (to `mg/L{FEU}`); INR, viral load and urine SG keep their signed units.                                                                           |
| F-3   | Add the curated units the accepted concepts need (ng/L, mg/L{FEU}, mg/L{DDU}, [pH], d) in a new migration.                                                                                              |
| F-4   | Blood-culture Gram stain and organism wait for the microbiology phase.                                                                                                                                  |
| CD-01 | `range.kind` = reference or decision; decision ranges are named category schemes; each hospital picks a flag basis per concept.                                                                         |
| CD-02 | New `obs.glucose_fasting` for the fasting test.                                                                                                                                                         |
| CD-03 | Troponin splits into I and T (hs); D-dimer FEU and DDU are separate concepts; creatinine method in a method register.                                                                                   |
| CD-04 | Plain factors only at entry; HbA1c IFCC is display-only, computed from the NGSP master equation.                                                                                                        |
| CD-05 | One `test.fbc` with an analyser profile per machine; MID/GRAN never map to neutrophils; research-use parameters cannot be released; P-LCR and P-LCC stored but hidden from clinicians.                  |
| CD-06 | Accept the concept addendum (59 new concepts after removing the 3 that already exist; ABO and RhD split; 10-pad dipstick; troponin retired into I/T).                                                   |
| CD-07 | Syphilis splits into treponemal RDT, RPR, TPHA and the dual HIV/syphilis RDT; add `test.coag_screen` (PT, INR, APTT).                                                                                   |
| CD-08 | Restricted classes: hiv (HIV rapid, viral load, CD4, dual RDT), tb (Xpert, LAM, AFB), sexual_reproductive_health (syphilis tests, urine pregnancy).                                                     |
| CD-09 | HIV algorithm and kits, dipstick brand tables and analyser profiles are dated, versioned configuration; kit and lot captured per test.                                                                  |
| LD-01 | Adult drafts from Eller 2008, Karita 2009 as the cross-check; each lab verifies locally (CLSI EP28) before signing.                                                                                     |
| LD-02 | Haemoglobin flags on the WHO 2024 anaemia scheme, adjusted for facility elevation; the reference interval is shown for information.                                                                     |
| LD-03 | Keep the African neutrophil lower limit, with an interpretive note on Duffy-null-associated counts.                                                                                                     |
| LD-04 | Fasting glucose, HbA1c and lipids are read by WHO thresholds and ATP III categories, not reference intervals.                                                                                           |
| LD-05 | **Viral load uses the WHO 2023 categories** (undetectable / suppressed ≤1000 / unsuppressed >1000) — this differs from the Uganda MoH rule at exactly 1000; show the scheme's source with every result. |
| LD-06 | Children: Kilifi for 28 days–17 months, Lugada for 18 months–18 years, nothing for 0–27 days; Kilifi's infant platelet lower limits are not activated.                                                  |
| LD-07 | CD4 is read by WHO categories; reference intervals for information only.                                                                                                                                |
| LD-08 | Troponin, thyroid, PT/APTT and D-dimer ship no defaults; the lab enters its kit insert's values.                                                                                                        |
| LD-09 | INR targets live on the patient's anticoagulation plan, not as a lab range.                                                                                                                             |
| LD-10 | Each lab declares its creatinine method (IDMS-traceable); only matching bands apply; eGFR (CKD-EPI 2021) for adults only.                                                                               |
| LD-11 | Coded results as listed (malaria density per µL; Xpert "trace" its own answer; dated HIV algorithm; dipstick trace not abnormal; weak D per transfusion policy).                                        |
| LD-12 | Evidence attached to every signed band: CLSI EP28 transference (20 samples) for adults; a written transference reason for children.                                                                     |

---

## 4. Scope

1. **Concept addendum (CD-06):** the accepted concepts as a signed CFC data file, generated migration, Drizzle and the typed registry, through the existing generator. Includes answer sets with an `abnormal` flag for coded and ordinal results.
2. **Tests (CD-02, CD-05, CD-07):** FBC with 31 components and analyser profiles (5-part DH-615, 3-part); `test.glucose_fasting` repointed; syphilis split; `test.coag_screen`; U&E gains bicarbonate (optional) and eGFR; LFT gains GGT; thyroid gains FT3; viral load gains log10; dipstick gains bilirubin and urobilinogen.
3. **Units (F-1 to F-3):** a migration adding the curated units; D-dimer's unit change.
4. **The range model (CD-01):** `kind` on range versions; decision schemes (category label, boundary inclusivity, clinical context such as pregnancy trimester, formula limits for age-continuous rules); a per-hospital, per-concept **flag basis**; facility elevation on the hospital profile and the WHO altitude adjustment as a signed table.
5. **Basis on the result (CD-03, CD-09, LD-10):** analyser profile, method register (creatinine method and IDMS traceability), kit and lot, unit basis.
6. **Import:** a lab-lead action that loads the research's bands for chosen concepts into the hospital's Reference ranges as **unsigned drafts**, each with its citation, population, method and confidence; bands with `verification` arrive locked.
7. **Reading a result:** the entry screen and the doctor's view show the flag from the chosen basis, the decision category in words with its scheme's source, and the reference interval for information. HbA1c shows mmol/mol beside %.
8. **Versioned configuration (CD-09):** the HIV testing algorithm (kits, order, outcomes, effective dates), dipstick brand tables, analyser profiles.

---

## 5. Steps and gates

- **Step 0 — Discovery and reconciliation.** Re-run the checks in `DECISIONS.md` against the live catalogue: the 3 concepts the research called new that already exist; the invalid-UCUM spellings; the `text` value type (MedSync's free text is `as_typed`); the test components the research drops (`obs.glucose` from the fasting test, `obs.troponin` from troponin). Read Phase 1's range and limit code. List every gap in the research that blocks a decision here. **STOP 0.**
- **Step 1 — GATE A proposal (documents only).** Schema diff for the range model, schemes, flag basis, elevation, profiles, method register and configuration; the addendum diff; wireframes for Test catalogue (profiles), Reference ranges (kind, flag basis, schemes, import), Hospital profile (elevation), result entry and the doctor's view; the import design; the hazard log seed; the test plan. **STOP 1** for the owner's signature.
- **Step 2 — Data layer:** migrations within 0107–0119; Drizzle parity; RLS probes. **STOP 2.**
- **Step 3 — Engines (pure):** scheme resolution (category by value, sex, age in days, context, formula), flag basis selection, altitude adjustment, FBC profile validation (MID/GRAN isolation, research-use block), HbA1c display conversion, eGFR (adults, declared method only), viral-load categories (WHO 2023 boundaries exactly as decided). Every rule has an id and a test. **STOP 3.**
- **Step 4 — Concept addendum and catalogue:** the signed data file, generated migration, the 33 tests and profiles. **STOP 4** (CSO signs the addendum).
- **Step 5 — Screens:** set-up (profiles, method register, flag basis, schemes, elevation), import of drafts, result entry and the doctor's view. Harness at 1440 and 390 px; axe 0 serious or critical. **STOP 5.**
- **Step 6 — Coded results and configuration:** answer sets with `abnormal`, the HIV algorithm as versioned data, dipstick brand tables. **STOP 6.**
- **Step 7 — Hardening and documents:** ADRs, user guide additions, hazard log, final report. **STOP 7 (final).**

---

## 6. Scenarios (each proven on the PGlite lane or in the harness)

1. A DH-615 FBC enters with 27 parameters; IG, P-LCR and P-LCC are stored; research-use parameters cannot be released; P-LCR and P-LCC do not appear in the doctor's view.
2. A 3-part FBC stores MID and GRAN; no neutrophil value exists for it; the neutropenia note never fires from GRAN.
3. A woman of 30 at a facility in the 1,000–1,499 m band with Hb 10.0 g/dL: the WHO scheme reads moderate anaemia after the altitude adjustment; the reference interval is shown beside it for information.
4. A healthy adult with neutrophils just above the African lower limit is not flagged and sees the Duffy-null note only when below the Western limit.
5. Fasting glucose in the WHO impaired band shows the category; a random glucose never uses fasting limits.
6. Viral load exactly 1000 copies/mL reads "suppressed (WHO 2023)"; the scheme's source is on screen.
7. CD4% of an infant below the WHO severe threshold is categorised by WHO, whatever the reference interval says.
8. A creatinine from a lab that has not declared its method: no eGFR, and no method-bound band applies.
9. D-dimer entered as DDU is never converted to FEU and no FEU cut-off applies to it.
10. Troponin with no kit values entered: no flag, and the screen says the laboratory has not set its assay's limit.
11. A neonate of 3 days: "No reference interval for this age"; no adult range applied.
12. Importing drafts: every band arrives unsigned with its source; a `verification` band cannot be signed; nothing flags until both signatures.
13. With `labCatalogueV2` off, behaviour matches Phase 1.

---

## 7. Gaps that block signing (from the research)

Lugada CD4 absolute counts (read Table 3 by hand); no haematology for days 0–6; paediatric chemistry (CALIPER, Kironde's table); WHO 2024 child anaemia cut-offs; Uganda Clinical Guidelines 2023 chapters; lactate and CRP from US sources only; the DH-615 operator manual (HCT measured or calculated, PDW unit); no LOINC for malaria density per µL. None blocks the build; each blocks signing the affected bands.

---

## 8. Out of scope

Critical limits (Phase 1 governs them); microbiology organisms and sensitivities; blood bank and crossmatch; reticulocytes; analyser interfacing.

---

## 9. ADRs (0251–0259)

Range kinds and decision schemes; flag basis per concept; facility elevation and the altitude adjustment; analyser profiles and the FBC; the method and kit register; the concept addendum v1.6; importing researched drafts; viral-load categories (WHO 2023, and the difference from the national rule); versioned laboratory configuration.

---

## 10. Definition of done

- [ ] All 25 decisions implemented as recorded; LD-05's difference from the national rule is visible on every viral-load result.
- [ ] The addendum is signed by the CSO; the 33 tests exist; units are valid UCUM.
- [ ] A hospital can import drafts, verify, and sign; nothing unsigned flags.
- [ ] Every rule id has a test; RLS probes green; axe clean; red-scarcity tests green.
- [ ] Scenarios 1–13 pass. With the flag off, behaviour matches Phase 1.
- [ ] Hazard log, user guide additions, ADRs and the final report written.
