# ADR 0252 — Decision schemes, the flag basis, and one store for signed configuration

**Status:** Accepted — 2026-10-12 (owner, also the CSO, on the instruction to pass every gate on the recommendations: [GATE A](../lab/phase-2/gate-a-proposal.md)). Built on `feat/lab-one-menu` behind its flag; migrations 0107–0111 are GATED and owner-applied. No clinical value is set by this decision.

## Context

Many "ranges" are decision limits (anaemia, diabetes, CKD stages, viral-load suppression, CD4). A low/high band cannot
hold a category scheme, and a reference interval is not a diagnosis (CD-01).

## Decision

1. **One table, `lab_signed_configs`**, holds every signed, versioned setting: decision schemes, the flag basis per
   concept, the hospital's elevation, the HIV algorithm, NCD field mappings, REF entries (eGFR, IFCC) and the addendum.
   Phase 1's two-signature rules apply unchanged; a signed payload is frozen; one version is in force per key.
2. **A scheme** is categories (each with `abnormal`), rows (sex, age in days, pregnancy with a gestation span, methods)
   with exact bounds and inclusivity, and an optional elevation table. A draft whose bounds leave a gap or overlap cannot
   be signed.
3. **The flag basis** per concept is "reference" or "scheme". On a scheme basis the category drives the H/L flag (its
   direction); the reference band is still shown for information. A scheme that does not fit the patient (age, sex,
   method, recorded pregnancy) falls back to the reference interval with the reason, never to another population's
   category.
4. **Elevation** is signed by the CSO and added to every cut-off. No signed elevation: "altitude not adjusted".
5. **Pregnancy** comes only from the record at collection; not recorded → the non-pregnant row, said so.
6. **Viral load** is read on the WHO 2023 categories (LD-05), with the scheme's source on every result.
7. **HbA1c IFCC** is display-only, from the signed REF entry.
8. Every interpretation is snapshotted on the result; signing a new scheme or basis never changes a released one.
