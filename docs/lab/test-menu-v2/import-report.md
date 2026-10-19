# Catalogue v2 import report (TM-1, Step 3)

Source `docs/lab/test-menu-v2/lab-catalogue-v2.json` (SHA-256 in `lib/lab/catalogue-v17.generated.ts`), read by
`scripts/emr/cfc-v17.ts` and generated into migration `0172_cfc_v1_7_lab_test_menu.sql`. A second run adds nothing
(PGlite S1). Status: imported as a draft addendum `cfc-1.7.0`; the in-product signatures are pending.

| | Count |
|---|---|
| Tests in the file | 291 |
| New tests (inactive until signed) | 255 |
| Existing tests given their catalogue facts | 36 |
| Results added | 428 |
| Results already present, kept as they are | 9: obs.hb_phenotype, obs.magnesium, obs.phosphate, obs.uric_acid, obs.amylase, obs.lipase, obs.upcr, obs.c_peptide, obs.vitamin_b12 |
| Unverified LOINC codes, imported as null with a note | 13 |
| Additions to existing tests (applied on signing) | test.troponin +obs.troponin_i; test.uacr +obs.urine_albumin, +obs.urine_creatinine; test.blood_culture +obs.ast_interpretation |
| Held (F-4: not defined in the file, waiting for microbiology) | test.blood_culture obs.blood_culture_gram_stain; test.blood_culture obs.blood_culture_organism |

**Tests by section:** haematology 28 · blood_transfusion 6 · clinical_chemistry 109 · immunology_serology 77 · microbiology 24 · parasitology 18 · molecular 19 · histopathology_cytology 10

**Unverified codes:** obs.csf_blood_glucose_ratio, obs.uds_methamphetamine, obs.uds_opiates, obs.uds_tramadol, obs.uds_benzodiazepines, obs.uds_barbiturates, obs.uds_methadone, obs.uds_mdma, obs.uds_tca, obs.uds_ketamine, obs.progesterone, obs.stool_blood_mucus, obs.stool_rbc

**Also:** TM-D12 changes `obs.tb_xpert_rif` from 89372-7 to 89489-9 (only while it still carries 89372-7).
The file lists v1 component lists for five tests that v1.6 changed (d_dimer, blood_group, lipid_panel, hiv_rapid,
tb_xpert); nothing is removed, so v1.6 stands. 22 free-text results import as `as_typed`.
