# ADR-0068 — Clerkship Cardiovascular Examination (tap-first I-P-A + structured murmurs + valve-lesion clusters)

**Status:** Accepted (CSO-authorised build 2026-06-12). Built on `feat/clerkship-cvs-exam`. A system-specific exam layer onto the general exam, following the respiratory pattern (ADR 0067).
**Context:** the Examination tab. Source: `clerkship-cardiovascular-examination-kickoff.md` (§1 finding set, §2 cluster table) + Hutchison Ch 13. **The full `clerkship-cardiovascular-examination-catalog.md` was not supplied** — the finding set + structured-murmur model + cluster→lesion table were authored from the kickoff + standard Hutchison Ch 13; **CSO to verify.** Reuses the general/respiratory three-state model; **no migration** (code reference data; captured in `examination.cardiovascular`).

## Decision

The cardiovascular exam as **tap-first I-P-A** (Inspection → Palpation → Auscultation; **no cardiac percussion**) with **structured murmurs** and a **sign-cluster → lesion** decision-support layer.

1. **Domain module = code reference** `lib/clerkship/exam/cardiovascular.ts` (types + catalog + structured murmur + pure engine). **No migration.** Captured in `examination.cardiovascular` (section_data).
2. **Structured fields (tap, not free text):** pulse rhythm / character / volume, JVP, apex location + character, S1/S2, added heart sounds; non-zonal I-P-A findings (peripheral/inspection/palpation/completion) reuse the general-exam `ExamFinding` three-state model. **Peripheral overlap (clubbing/cyanosis/oedema) + lung bases reused, not duplicated.**
3. **Structured murmur model** — each murmur: timing · location · radiation · intensity (1–6) · pitch · manoeuvre, all tapped. Multiple murmurs supported; rendered to readable prose (`describeMurmur`).
4. **Cluster → lesion (`matchCvsPatterns`, pure, TDD)** — matches the recorded cluster (murmur + pulse character + apex + heart sounds + peripheral signs) to: aortic stenosis / aortic regurgitation / mitral stenosis / mitral regurgitation / heart failure / **infective endocarditis** / **tamponade**. **Transparent** (each shows its signature), **MULTIPLE on ambiguity** (a lone ejection-systolic murmur → AS + MR — broadening), **must-not-miss / emergency flagged** (IE, critical AS/AR, HF, tamponade in red), **empty when nothing recorded — NEVER auto-diagnoses.** Uganda **rheumatic** valve disease woven in (MS / malar flush).
5. **Reasoning thread** — CVS findings + murmurs + matched lesions feed the differential (`cvsReasoningTokens`).

## Examination-tab restructure (same PR)

The Examination tab is now a **per-system card switcher** (vitals always on top, then segmented **General · Cardiovascular · Respiratory · Abdomen · Neuro**, each its own card; a teal dot marks systems with findings). General + Respiratory + Cardiovascular are structured; Abdomen + Neuro are free-text placeholders (later layers). Also fixed: the respiratory **Added-sounds** grid no longer pre-selects a zone (was defaulting to "lower right").

## Consequences

- A full normal CVS exam is a few taps ("Normal CVS exam" fast path); not-examined ≠ normal.
- The cluster→lesion layer is decision-support only — the clinician interprets + decides.
- **Follow-up:** CSO to verify the authored finding set + structured-murmur model + cluster signatures vs the full catalog. Abdomen/neuro/MSK + particular-group CVS exams are later layers (same pattern).
