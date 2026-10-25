# ADR 0420 — `packages/patient-core`: one home for the patient's rules

**Status:** Accepted — 2026-10-25 (GATE A, docs/patient-web/gate-a-proposal.md; signed by Fadhul, CSO, in chat: "do what's recommended").

## Decision

- The pure rules both apps use live in `packages/patient-core/` (no package.json; the `@patient-core/*` alias in the root and phone tsconfigs, the phone's jest mapper and `vitest.config.ts`), beside `packages/clinical-rules/`: the reading classifier, fees, visit statuses, the symptom tier preview, dose slots, and the notification kind map (a target key; each app maps keys to its routes).
- Availability stays in `supabase/functions/_shared/slots.ts`, already one copy.
- Each moved phone file left a re-export, so no phone import or test changed. One fixture table (`packages/patient-core/fixtures/readings.json`, every threshold edge ±0.1) runs in both apps' tests.
- Copying a clinical rule into either app is not allowed.
