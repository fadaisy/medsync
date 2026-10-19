# Lab test menu v2: research notes for sign-off

Researched 19 October 2026. The data is in `claude/lab-catalogue-v2.json`. It adds to v1 (`claude/lab-catalogue-research.v1.json`) and never renames a v1 id.

**Status: proposal only.** Concepts and tests import as a **signed addendum** (laboratory lead and CSO), the same path as Phase 2 CC-1. Sections are **recommendations**: each hospital may change them. The file contains no reference ranges and no critical limits.

## Why the menu is tiring today

The Diagnostics page (Hospital admin → Departments → Diagnostics → Laboratory) shows one row per **LOINC code**: the 97 rows of `loinc_codes`. Every analyte is its own row. Haemoglobin, MCV and each white-cell count all need a section, a place, hours and a turnaround, so a full blood count is 27 rows to set up. 88 of the rows carry the category "Laboratory", so the category says nothing.

The hub design (PROMPT-HOSPITAL-SERVICES-HUB DX-1) already says an offering is **(hospital, catalogue test)**. The build keyed it to LOINC codes instead. Version 2 restores the design: a hospital sets up **tests** (what doctors order), and the results inside a test come with it.

## What the file holds

| | Count |
|---|---|
| Tests | 291: 33 existing (v1 and the Phase 2 splits) and 258 new |
| New concepts (results) | 437; together with v1's 119, that makes 556 results inside those tests |
| Concept LOINC codes | 395 verified on loinc.org · 13 unverified · 29 have no suitable code |
| Order or panel LOINC codes | 213 verified; 77 tests have no order code (no LOINC panel matches) |
| Tests whose level comes from the 2017 national menu | 192; the other 99 use research judgement |
| Ranges are kit-dependent | 120 tests |
| Gaps recorded | 77 |

**Tests by recommended section**

| Section | Tests | Examples |
|---|---|---|
| Haematology | 28 | FBC, ESR, film, retics, sickling and HemoTypeSC, Hb HPLC, G6PD, coag screen, fibrinogen, D-dimer, factor VIII/IX, CD4, 20WBCT |
| Blood transfusion | 6 | Group (ABO and RhD), group and save, crossmatch (GXM), DAT, IAT, cord blood screen |
| Clinical chemistry | 109 | U&E/RFT, LFT, lipids, glucose and OGTT, HbA1c, Ca/Mg/PO4, cardiac markers, blood gas, fluids, urine chemistry, thyroid, hormones, tumour markers, iron studies, B12/folate, SPEP, free light chains, drug levels, cholinesterase |
| Immunology and serology | 77 | **C3, C4 and C3+C4, CH50, ANA (IFA: screen, titre, ICAP pattern; and EIA), anti-dsDNA (EIA and Crithidia)**, ENA panel, RF, anti-CCP, ANCA (IFA, MPO/PR3), anti-GBM, antiphospholipid, thyroid antibodies, immunoglobulins, IgE, coeliac, autoimmune liver, HIV algorithm, syphilis tests, hepatitis B profile, HAV/HEV, H. pylori, Brucella, TORCH, dengue, rK39, CrAg (serum and CSF), UVRI surveillance serology |
| Microbiology | 24 | Gram stain; cultures (blood, urine, stool, CSF, pus, sputum, HVS, throat, eye, ear, fluids, catheter tip); AFB (ZN and LED); KOH; fungal culture; TB culture and DST; cholera RDT; India ink |
| Parasitology | 18 | Malaria smear and RDT, urinalysis (dipstick, microscopy, full R/E), stool microscopy and concentration, Kato-Katz, Schistosoma (urine, CCA), microfilaria, trypanosomes, Leishmania, skin snip, semen analysis |
| Molecular | 19 | HIV viral load, EID, HIV drug resistance, HBV and HCV viral loads, Xpert MTB/RIF Ultra and MTB/XDR, LPA (first-line and second-line), SARS-CoV-2, influenza, 4-plex respiratory panel, CT/NG, HPV, VHF panel, Ebola PCR, mpox, meningitis PCR, HLA-B27 |
| Histopathology and cytology | 10 | Histology, frozen section, trephine, FNAC, Pap smear and LBC, fluid and CSF cytology, IHC, breast receptors |

## How a test is described

Each test carries:
- `section`: the recommended section;
- `aliases`: the names people search for, such as "RFTs", "B/S", "GXM" and "Urine R/E";
- `components`: the results, in report order;
- `specimen` and `container`: the tube, in Ugandan wording;
- `orderLoinc`;
- `minLevel` with `levelBasis`;
- `usualRoute` and `referTo`: where a typical regional referral hospital sends it;
- `restricted`: a proposed class, which the CSO signs;
- `kitDependentRanges`;
- `advisory`: shown for low-value tests;
- `notes` and `sources`.

## Levels of care: where they come from

**Source.** Levels come from the **National Standard Test Menu, Techniques and Supplies List for Laboratories** (MoH/UNHLS, March 2017), Table 1 (PDF pp.19–29), which the research read in full.
- Each level does everything the level below does, so `minLevel` means "expected from this level up".
- A 2024 UNIPH bulletin gives the national menu size per level: RRH 146, GH 85, HC IV 57, HC III 31. MedSync's level templates come close: RRH 151 in-house, GH 110, HC IV 61, HC III 33. MedSync counts are higher where it splits one national line into several orderable tests (for example TSH, FT4, FT3 and TFTs).
- The same bulletin reports that 68 of the 146 RRH tests have no result field in DHIS2. That matters for HMIS mapping.

**The table and the narrative disagree** for several tests:

| Tests | Table says | Narrative says |
|---|---|---|
| PT/INR, CSF analysis | GH | HC IV |
| Thyroid, fertility hormones, cardiac markers | RRH | GH |
| HbA1c, Hb electrophoresis | NRH | RRH |
| Culture and sensitivity | GH | RRH |
| Lipids | HC IV for cholesterol and TG; RRH for LDL and HDL | GH |

The file uses the **lower** of the two, and shows both in `levelBasis`. In all, 33 tests are affected. Decision TM-D04 below asks for your choice.

**HC II** has no laboratory. Its six point-of-care tests are HIV, malaria, HBsAg, syphilis, pregnancy and glucose.

**Referral network**
- **CPHL first**, via the hub, for specialised tests. This covers viral loads, EID, HPV, HIV drug resistance, IGRA, sickle cell confirmation and immunophenotyping.
- **NTRL:** TB culture, identification and DST.
- **UVRI:** VHF (sent with the case investigation form), arboviruses, plague, and measles/rubella and polio surveillance.
- **UBTS:** red cell phenotyping, antibody screening, and screening of donor blood.
- **UCI:** tumour markers, IHC, drug levels, SPEP.
- **Private reference labs** for most autoimmune tests. This is judgement: no published menu could be opened.

## Restricted classes (proposed; the CSO signs)

- **Already decided (Phase 2 CC-8):** HIV, TB and SRH classes as signed.
- **New proposals:**
  - **hiv:** EID PCR, HIV drug resistance.
  - **tb:** TB culture, phenotypic DST, LED AFB, LPA first-line and second-line, Xpert MTB/XDR.
  - **srh:** HSV-2 IgG, serum hCG (qualitative), HVS wet prep and culture, urethral swab, semen analysis, CT/NG NAAT, HPV DNA.
- **CD4:** stays hiv. It is recommended in **Haematology**, because it is a cell count on the FBC tube; a lab may move it.
- **Not restricted:** TORCH, HTLV and CrAg (the CSO may change this).

## Low-value tests: kept in the catalogue, not in level templates

Each has an advisory a doctor sees when ordering:
- **Bleeding time and Lee-White clotting time:** obsolete. 20WBCT is the snakebite test.
- **Widal, typhoid RDT and typhoid stool antigen:** low accuracy. Prefer blood culture.
- **H. pylori serology:** cannot tell past from current infection. Prefer the stool antigen test.

The 2017 national menu still lists bleeding/clotting time, a typhoid test and H. pylori antibody. Decision TM-D05 asks for your choice.

## Merge decisions made here (review)

- **U&E and RFT:** one test, `test.urea_electrolytes`. "RFTs" is an alias, so the same order is never placed and billed twice.
- **Urinalysis:** recommended in **Parasitology**, where Ugandan labs read it on the microscopy bench. Many labs move it to chemistry; the board shows how.
- **`test.urinalysis_complete` (Urine R/E):** a new test that combines appearance, dipstick and microscopy.
- **LPA:** the molecular strand's two tests (first-line and second-line) are kept. The microbiology strand's single LPA test and its 6 concepts are dropped.
- **ASO:** the immunology strand's test is kept; the serology strand's duplicate is merged into it.
- **Additions to v1 tests (nothing removed):**
  - `test.troponin` gains contemporary `obs.troponin_i`;
  - `test.uacr` gains urine albumin and urine creatinine;
  - `test.blood_culture` gains an AST summary.
- **`test.syphilis`:** narrowed to the treponemal RDT, per Phase 2 CC-7.
- **Blood gas** has its own whole-blood Na, K, glucose, lactate and HCO3 concepts. They are never trended together with serum values.
- **Capillary glucose (glucometer)** is its own test. Bedside readings are never filed as lab plasma glucose.
- **The same LOINC code on two concepts:** `obs.mtbc_dna_detected` (LPA/XDR) and v1 `obs.tb_xpert` both use 38379-4. They are kept separate because the method context differs; the export maps them.

## Open problems to clear before signing

1. **13 unverified concept codes:**
   - 7 urine drug screen codes now DISCOURAGED in favour of method-named codes;
   - progesterone 14890-8, whose page shows no status;
   - stool blood/mucus, stool RBC, tramadol, ketamine and the CSF:blood glucose ratio, which have no code yet.
2. **v1 `obs.tb_xpert_rif` uses 89372-7, which is TRIAL status.** The ACTIVE alternative is 89489-9.
3. **The 99 test levels that are judgement** need checking with Mulago, an RRH, CPHL and a private reference lab. Most are immunoassays and autoimmune tests.
4. **The referral list has no value for Makerere/Mulago pathology.** Histology currently has `referTo: null`. Add a value, for example `MAK_PATH`.
5. **Codes that need a mapping for export:**
   - LOINC's pregnancy OGTT panel expects 14996-3 for the baseline sample;
   - the infant DBS sickle pattern is one combined answer, while LOINC codes each haemoglobin.
6. **Search limits.** Several strands ran out of web searches. Every code marked verified was still opened on loinc.org; only Uganda routing went unchecked.

## Decisions for you (before the build)

| id | Decision | Recommendation |
|---|---|---|
| TM-D01 | What a hospital sets up | Orderable tests only. Results come with the test and never get a section of their own |
| TM-D02 | Section | The catalogue's recommended section, inherited. A hospital may override it per test; an override is shown as "Changed from …" |
| TM-D03 | Level templates | Built from `minLevel` and `levelBasis` (national menu first). Rules TM-6 in the prompt |
| TM-D04 | Table versus narrative | Use the lower level (policy intent), with both shown |
| TM-D05 | Low-value tests | In the catalogue with an advisory, off by default in templates |
| TM-D06 | New restricted-class proposals | As listed above; the CSO signs |
| TM-D07 | Hospital profiles | Allowed. A profile is an ordering shortcut over menu tests; each test keeps its own section, results and class |
| TM-D08 | Asking for a missing test | A request goes to the MedSync catalogue team. Hospitals cannot create free-text tests |
| TM-D09 | Who edits the menu | The hospital admin and the laboratory lead, on one shared screen. It is operational, so no signing; every change is audited |

## Sources (main)

- **LOINC 2.82 term and panel pages** on loinc.org: every verified code was opened.
- **MoH/UNHLS, National Standard Test Menu, Techniques and Supplies List for Laboratories** (March 2017), from the CPHL library.
- **UNIPH bulletin (2024)** on the national menu and DHIS2 coverage.
- **CPHL laboratory handbook** NHLS-004 v5.0 (2024); the 2017 hub guideline; NHLS Policy II (2016).
- **WHO Model List of Essential In Vitro Diagnostics:** the eEDL site shows EDL5; the selection page still lists EDL4 (2023).
- **Uganda Consolidated HIV Guidelines 2022**; WHO dual HIV/syphilis RDT brief (2019); WHO hepatitis testing brief (2016); WHO TB Module 3 (2024); WHO semen manual, 6th edition (2021).
- **ICAP consensus on ANA patterns** (Frontiers) and anapatterns.org.
- **CDC Yellow Book** (typhoid); Standley 2010 (urine CCA).

All 40 sources are listed in the file under `sources`.

## Independent check

A separate reviewer, who had not seen how the codes were chosen, re-opened 63 codes on loinc.org on 19 October 2026. The sample was C3, C4, the three ANA results, anti-dsDNA, 40 random concept codes and 17 order codes. The results are in `verify-result.json`:

| Result | Count |
|---|---|
| ACTIVE | 63 of 63 |
| Long name matches | 62 (the one difference is spelling only) |
| Good fit | 62 |
| Weak fit | 1 |
| Wrong | 0 |

The weak fit is the HVS wet prep order code, 47531-9. It covers the wet mount only, so the Gram stain part needs its own code; the file notes this.
