# ADR-0075 — NCD-prioritised diagnosis catalog + catalog picker

**Status:** Accepted (kickoff GATES A–D run together under "deploy the finished product", 2026-06-16; GATE A clinical model CSO-signed). Built on `feat/diagnosis-catalog-ncd`. Extends [ADR-0074](docs/adr/0074-assessment-as-diagnostic-logic.md) (Assessment-as-diagnostic-logic). **Ships GATED DARK** (`NCD_CATALOG_CSO_SIGNED = false`).

**Context:** The diagnostic-logic Assessment (0074) surfaced the maps-derived acute differentials. This adds the **chronic-disease (NCD) layer** — the Ugandan NCD burden — each NCD defined by its **supporting clinical findings** AND its **defining diagnostic criteria** (the measured thresholds), plus a doctor's **"select a diagnosis from the catalog"** picker. **No migration.**

GATE A decisions (CSO-signed): the kickoff NCD list as-is (15 entries); **WHO/Uganda-first criteria** (specialty fallback); add the **high-yield complications + core risk tokens** as the missing source-catalog features (flagged follow-up).

## Decision

1. **Parallel NCD catalog, one source of truth preserved.** `lib/clerkship/diagnosis/ncd-catalog.ts` is a curated `net_new` catalog SEPARATE from the maps-derived acute `catalog.ts`; the two are merged only at the **suggestion/search point**. It never alters the reasoning maps — the catalog and the rail cannot diverge.
2. **Supports DERIVED from existing catalogs, never invented inline.** Every `supportingSymptom` is a real HPC (0042/0043) or ROS (0045) code; every `riskFactor` is a real condition picklist code (0046). A CI test asserts each code is defined in the seed SQL (so an invented code fails the build).
3. **Defining criteria fetched + cited + version-stamped, never from memory.** The HbA1c/BP/eGFR/spirometry/TFT/echo thresholds were fetched (WHO/Uganda-first; ADA/ISH/ESC/KDIGO/GOLD/GINA/ATA/WHF fallback) via the build-time research fan-out, persisted at `docs/clinical/ncd-defining-criteria-research.json`; 17 `needs_cso_input` markers + Uganda calibration notes (HbA1c unreliability with anaemia/HbS, assay-dependent TSH, APRI-vs-FibroScan, 2012-vs-2023 WHF RHD). Criteria **inform** the rank + show what's met vs not; they **never auto-diagnose**. ICD-10 only from verified `ICD10_CODES`, else null.
4. **Rank by support; never assert.** `ncd-suggest.ts` (pure/TDD) matches supports against the captured codes (HPC + ROS-present symptoms; real PMH condition codes) and ranks; **must-not-miss surfaces regardless of support**; not-measured ≠ normal.
5. **The catalog picker** (`diagnosis-picker.tsx` + `search.ts`) searches the acute (live) + NCD (gated) catalogs, NCDs first; a selection commits through the **same `differential → encounterDiagnoses` path** as a ranked suggestion (with a dedupe guard) — one record, never a fork. The diagnosis of record is the clinician's.
6. **Gated dark.** `NCD_CATALOG_CSO_SIGNED = false` ⇒ `ncdCatalog()` is empty ⇒ no NCD suggestions surface and the picker shows only the signed acute catalog, until the CSO ratifies the criteria.

## Consequences

- **Pre-deploy adversarial review (15 agents)** confirmed the gating + commit-path + criteria fidelity, and caught a **real risk-factor matching bug** (PMH _display_ strings were normalised instead of using condition codes) — fixed by threading real `conditionCodes` from the form. The "invented symptom codes" finding was a **false positive** (reviewers checked only the 16 HPC codes and missed the 572 ROS codes); now permanently guarded by the seed-SQL code-validity tests.
- **To activate (CSO):** ratify the criteria (especially the 17 `needs_cso_input`), then flip `NCD_CATALOG_CSO_SIGNED = true`. No migration, no redeploy of logic.
- **Open follow-ups (flagged):** the GATE-A "added features" — diabetic + hypertensive retinopathy grading, structured urine dipstick, hypertensive-LVH pattern, NCD risk tokens (smoking pack-years / BMI [needs a height/weight vital] / physical activity) — are not yet added to the source catalogs (the catalog uses existing codes; these enrich complication/risk capture). Diabetes type-1-vs-2 classification logic + measured-criteria auto-evaluation against results are future work.
