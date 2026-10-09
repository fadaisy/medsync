# ADR 0220 — Diagnoses relate to each other: secondary to, refined, co-existing, known

**Status:** Accepted — 2026-10-09 (owner, also the CSO). GATE A signed all 17 decisions of BRIEF-DX-RELATIONS as
recommended (D-REL-10 later withdrawn, below); catalogues, new terms and build rulings signed. Migrations 0095 and
0096 are GATED (the owner applies them). Supersedes the note-level links of ADR 0219 (`meta.with`), which now become
record-level relations.

## Context

The owner asked for diagnoses to relate on step 09 the way clinicians think: severe anaemia _secondary to_ malaria;
ACS with its risk factors (diabetes, hypertension, dyslipidaemia) and its subtypes (unstable angina, NSTEMI, STEMI)
decided by the ECG and troponin; malaria and pneumonia _co-existing_; a known chronic illness kept in view while a
new one is diagnosed; and drag and drop to make and arrange the links. A Claude chat reasoned the design out from
a brief (docs/emr/dx-relations/: design, decisions, 19 vignettes, catalogues); this ADR records what was built.

## Decision

1. **Four stored relations** in an append-only, RLS-protected `condition_relations` table (0096): `due_to` with a
   label (complication, secondary, precipitated by: one causal relation, D-REL-03), `associated_with`,
   `risk_factor_for` (stored only when the clinician includes the risk-factor line, D-REL-04) and `episode_of` (a
   known problem-list condition active this visit). The database refuses self-links, loops, more than 4 levels of
   causes, and any relation on a differential or refuted diagnosis (D-REL-08). A relation takes both ends'
   restricted classes and is invisible without them, with no placeholder (D-REL-09). Removing a diagnosis retires
   its links (a trigger, origin `system_end_removed`), and the effect shows "Cause removed: review", which must be
   acknowledged before signing.
2. **The board's places:** leading (one primary, D-REL-01); co-existing; linked (shown once, on the higher end);
   differential; known conditions (problem-list chips, "Active this visit"); deferred. Swapping the leading with a
   co-existing diagnosis keeps both working and their links; moving a linked diagnosis to the differential asks,
   then retires its links.
3. **Drag and drop** (pointer events: mouse, touch long-press, and the WAI-ARIA keyboard pattern) plus a
   "Relate to…" menu. A drop applies a signed catalogue relation at once with inline Change and Undo; a reversed,
   direction-ambiguous or uncatalogued pair opens a centred chooser with no preselection (D-REL-06).
4. **Refinement** is a new version of the same condition (`refined_from` kept); a wrong diagnosis is Replaced
   (refuted with a reason, the new one added) and listed as ruled out (D-REL-05). The desk shows each subtype's
   criteria beside the deciding tests and the clinician picks (REF-01: no structured ECG yet). **Severity is a
   stage**, recomputed from the record, never a new diagnosis (D-REL-14): anaemia (WHO 2024), CKD (KDIGO), AKI
   (KDIGO, against a baseline), CURB-65; blank gives no stage.
5. **Catalogues (signed):** subtypes (21 parents, 56 subtypes), causes (302 pairs, 6 coded non-diagnosis
   precipitants), risk factors (98 pairs, 3 social-history exposures). **REF-DX-TERMS v1.2** (0095): 12 new terms,
   each ICD-11 code read on the WHO API (MMS 2026-01) and signed, five corrected to WHO's own (viral meningitis
   1C8E.Z, not the proposed fungal 1D01.1; hypertensive emergency and severe hypertension without organ damage
   BA03; community- and hospital-acquired pneumonia CA40.Z&XB22 / &XB25). HFmrEF is held (D-REL-13).
6. **D-REL-10 withdrawn.** It assumed five AIDS-defining illnesses were unrestricted today; the signed catalogue
   (ADR 0206) marks them HIV-restricted, and they stay so. Every clinician on the desk holds every class today.

## Not built (deferred)

HMIS counting of linked diagnoses (D-REL-07 recorded; needs the HMIS team), the death-certificate chain proposal,
automatic refinement from structured ECG or troponin series, per-user restricted classes (the seam is
`app.restricted_classes`).
