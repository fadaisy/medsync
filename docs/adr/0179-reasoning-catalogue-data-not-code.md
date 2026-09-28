# ADR 0179 — The reasoning catalogue is data, not code; suggested evidence is not recorded until accepted

**Status:** Accepted — 2026-09-28. GATE A (summary and impression) signed by the CSO: 272 profiles, 100 rules,
14 REF-DX entries and 10 named scales (`data/clerking/dx-signoff.v1.json`; D-SI-12, D-SI-14, D-SI-17, D-SI-18,
D-SI-22, D-SI-25, D-SI-30; R-1 to R-6).

## Context

Step 09 needed decision support (what else it could be, what supports it, what has not been asked) without the
machine ranking diagnoses or writing anything the clinician did not choose.

## Decision

1. **One catalogue, hash-pinned.** `data/clerking/clerking-diagnosis-catalogue.v1.json` (MS-EMR-DX-CAT-001), parsed
   with Zod, served at `/api/clerking/dx-catalogue?v=<sha16>` with its term map and names, fetched once per session.
   `npm run clerking:catalogue-check` validates all three catalogues and every id that crosses between them, in CI.
2. **One evaluator.** Diagnosis atoms extend the examination and history rule language
   (`lib/clerking/exam/context.ts evalCond`): family condition, medicine taken or not, social `any_of`, NEWS2 total,
   age. No second evaluator.
3. **Inert until signed (SI10).** A profile or rule not in the sign-off neither suggests nor marks evidence ("Reasoning
   aids awaiting sign-off"). Terminology stays owned by REF-DX-TERMS; the catalogue holds no names or codes.
4. **Suggested is not recorded (SI3).** Suggested marks are dashed and say "Suggested"; nothing is stored, counted,
   written to the note or used for "Not yet explained" until the clinician accepts it (one tap per column).
5. **Never ranked by likelihood (SI2).** Suggestions follow signed rule order, must-not-miss first within a rule, at
   most eight shown (D-SI-12). Profiles are found by the term's uuid (`uuidV5("diagnosis_terms:" + id)`, D-SI-22),
   or by name for a term added as typed words before its seed is applied.
6. **Restricted classes (SI9, D-SI-18).** Restricted diagnoses, evidence and asks appear only to a viewer holding the
   class (today: any clinical viewer with an access basis); patient-facing text drops them.
7. **Asks route to their owners (SI4, D-SI-17).** History answers are written through the history step's own
   updaters; examination, vital and classifier targets open step 07. A red flag whose symptom is unanswered is asked
   as the symptom first, merged with any ask of the symptom itself.

## Consequences

- Changing clinical content is a catalogue change and a new sign-off, not a code change.
- The engines are pure and fixture-tested both ways for every rule (`tests/clerking/si-rules.test.ts`).
- The matrix exists from 834 px; phones show evidence lists in Details (D-SI-14).
