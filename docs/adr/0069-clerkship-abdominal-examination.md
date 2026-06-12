# ADR-0069 — Clerkship Abdominal Examination (tap-first full IPPA by region + structured organs + PR honesty + constellation→pattern)

**Status:** Accepted (gates run together with CSO authorisation 2026-06-12). Built on `feat/clerkship-abdominal-exam`. The third system-specific exam layer, following respiratory (ADR 0067) + CVS (ADR 0068).
**Context:** the Examination tab. Source: `clerkship-abdominal-examination-catalog.md` — **supplied in full with the kickoff** (unlike resp/CVS), so the finding set + constellation table are catalog-anchored. Hutchison Ch 14. **No migration** — code reference data (`lib/clerkship/exam/abdominal.ts`); captured in `examination.abdominal` (section_data).

## Decision

1. **Region model (ratified): the 9 regions** — RUQ/epigastric/LUQ · R-flank/umbilical/L-flank · RIF/suprapubic/LIF — as a 3×3 tap-to-cycle grid with two modalities: **tenderness** (tender → deep → off) and **guarding** (voluntary → involuntary → off). Rigidity (none/localised/**board-like**) + rebound/percussion-tenderness as direct controls.
2. **Structured organs** — liver (palpable + span below costal margin + edge + craggy surface + tender + pulsatile), spleen (palpable + extent incl. **massive-to-RIF** + notch + can't-get-above), kidneys (ballotable per side), **aorta (expansile = alarm-styled)**, bladder. **Structured masses** (murmur-card pattern): region + size + surface + edge + consistency + mobility + expansile-pulsatile + tender.
3. **Percussion/auscultation** — shifting dullness + fluid thrill (ascites), **loss of liver dullness (perforation — alarm)**, bowel sounds (normal / tinkling / absent ≥3 min), bruits, succussion splash.
4. **PR honesty control** — examined / **not-examined** / declined + findings chips (blood/melaena/mass/haemorrhoids/prostate/tone/impaction). **Never silently dropped:** the prose states PR status whenever the exam has content, and the "normal abdominal exam" fast path leaves PR **not-examined** (it never claims an unperformed PR).
5. **Constellation → pattern (`matchAbdoPatterns`, pure, TDD 19 tests)** — peritonitis (board-like rigidity OR involuntary guarding + rebound — **emergency**), ruptured **AAA** (expansile mass — emergency), **perforation** (loss of liver dullness — emergency), obstruction (distension + tinkling), ascites (shifting dullness/thrill — causes listed incl. **TB peritonitis/schistosomiasis**), portal hypertension (splenomegaly + ascites/caput), chronic liver disease (≥2 stigmata), hepatomegaly craggy (**HCC** flag) vs smooth-tender, **massive splenomegaly (Uganda: malaria/HMS · schistosomiasis · sickle · CML · lymphoma · myelofibrosis)**, **β-hCG/ectopic check** on lower-abdominal tenderness, **GI-bleed shock check** on PR blood/melaena. Transparent signatures, multiple on ambiguity, empty when nothing recorded — never auto-diagnoses.
6. **Reasoning thread** — findings + constellation feed the differential (`abdoReasoningTokens`); exam targets already surface in the panel.

## Consequences

- Replaces the free-text "Abdomen" card in the per-system Examination switcher; Neuro remains the last free-text placeholder (+ MSK later).
- The β-hCG/ectopic prompt fires on lower-abdominal tenderness without knowing sex/age (the exam object doesn't carry them) — deliberately over-inclusive as a safety prompt; honest about being a check, not a finding.
- Genitourinary/DRE-detailed + groin/hernia focused modules + paediatric/obstetric/acute-surgical abdomens are flagged later layers.
