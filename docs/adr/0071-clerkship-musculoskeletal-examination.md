# ADR-0071 — Clerkship Musculoskeletal Examination (GALS + regional Look-Feel-Move + arthropathy patterns + back red flags)

**Status:** Accepted (gates run together with CSO authorisation 2026-06-12). Built on `feat/clerkship-msk-exam`. The fifth system-exam layer (resp 0067 · CVS 0068 · abdo 0069 · neuro 0070 · MSK 0071) — a NEW sixth card in the per-system Examination switcher.
**Context:** Source `clerkship-musculoskeletal-examination-catalog.md` — **supplied in full**. Hutchison Ch 15 + GALS (Doherty). **Overlaps the `joint_pain` reasoning map + the neuro cauda-equina/cord flags — reused, not contradicted** (the back-flag cauda options ARE the neuro `CAUDA_OPTS` import). **No migration** — code reference data (`lib/clerkship/exam/musculoskeletal.ts`); captured in `examination.musculoskeletal`.

## Decision

1. **Two-level model (ratified)** — the **GALS screen** (3 questions + Gait/Arms/Legs/Spine domains, each normal/abnormal; "Normal GALS screen" fast path) as the rapid screen; an abnormal domain → add a **regional Look→Feel→Move card** (region × side) with generic + region-specific LOOK chips, FEEL chips, structured **ROM** (full / restricted / restricted+painful) and **tap-to-cycle special tests** (untested → positive → negative) per region (Phalen's/Tinel's · painful arc · Schober's/SLR · Thomas/Trendelenburg · effusion/cruciates/McMurray's · Simmonds).
2. **Pattern characteriser** — distribution / symmetry / joint size / morning stiffness + character chips (hot swollen joint [alarm-styled], cannot weight-bear, worse with use, migratory, preceding sore throat) — the structured inputs the arthropathy engine reads.
3. **Back-pain red-flag screen** — prominent, grouped: **cauda equina (neuro options reused)** + **cord** (alarm-styled) · malignancy · infection (TB/Pott's) · fracture. Mechanical back pain is exclusion-only — the engine surfaces flags before anything mechanical.
4. **Pattern engine (`matchMskPatterns`, pure, TDD 16 tests)** — septic arthritis (**any hot swollen joint — septic until proven otherwise, emergency**), cauda equina / cord compression / compartment syndrome (emergencies), back red flags, rheumatic fever (migratory + sore throat — must-not-miss), inflammatory/RA, OA, gout (**hot 1st MTP surfaces gout AND keeps septic — tested broadening**), spondyloarthropathy (Schober's/sacroiliac/enthesitis), psoriatic, **sickle-cell (dactylitis broadens to psoriatic + sickle — Uganda)**. Transparent, multiple-on-ambiguity, empty when nothing recorded.
5. **Reasoning thread** — findings + patterns feed the differential (`mskReasoningTokens`), consistent with the `joint_pain` map.

## Consequences

- The Examination switcher now has six cards (… · Neuro · **MSK**).
- Later layers (flagged): skin/eyes/ENT/breast pack; paediatric MSK (DDH/limp/NAI); the acute hot-joint + trauma/fracture focused pathways; detailed single-joint proformas.
