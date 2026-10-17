# ADR 0342 — The patient phone reads the patient's own records

**Status:** Accepted — 2026-10-17. Owner decision. It narrows law L2 of the Tide v1 build prompt, and the "demo data" half of ADR 0340, for the records named below. Gate CG still governs anything a clinician writes that the patient has not been given.

## Context

Tide v1 shipped its health screens (readings, medicines, doses, mood, lab results, chat) on fixtures, because law L2 kept clinical data off the phone until Gate CG. The owner then asked for an app that works end to end in Expo, and chose to use the tables that already exist rather than keep demo data.

Two sources already exist, and the web already shows both to the patient:

- **The patient's own log** (migration 0029): `personal_health_logs`, `self_medications`, `self_medication_takes`. The web's `/patient/track` uses these. The patient writes them, and only the patient can read them. No clinician can.
- **What a clinician chose to share** (migration 0091, ADR 0203): `patient_visit_summaries`. The copy is encrypted, the clinician decides what to share or hold, and the web shows it at `/patient/care/visits/[id]`. It names the tests ordered, but carries no result values: "Results will be shared after your clinician reviews them."

## Decision

1. **The phone reads and writes the patient's own log directly**, under the 0029 row-level security:
   - readings;
   - the medicine list and the doses taken;
   - mood, pulse, water and minutes walked, as new kinds in migration 0170.

   The dose derivation is the web's own `lib/patient/doses.ts`, imported, not copied.
2. **The phone shows shared visit summaries** through one authenticated route, `app/api/mobile/visit-summaries`. The route checks the caller's Supabase token, then uses the web's `listVisitSummaries` / `getVisitSummary`, so the key never leaves the server.
   - Lab results show the tests ordered and the summary's own sentence about results. No value is invented.
   - Medicines show names and "As your clinician prescribed", never an amount (law L5).
3. **The words say who can see what.** A reading the patient logs is visible only to the patient. The phone never says "your care team can see it", because no clinician can read `personal_health_logs`.
4. **Chat is hidden behind `mobileChat` (off)** until there is a clinician inbox. Every feature that is off for now stays built behind a switch in `EXPO_PUBLIC_MOBILE_FLAGS`.
5. **Queue numbers follow ADR 0084 §6.**
   - "N ahead of you" appears only on the ticket, once the patient is present. It comes from `public.patient_intake_ahead` (migration 0170).
   - No count appears anywhere else, and there is never a place number, a total or a wait.
6. **Unchanged:**
   - The thresholds file is still `pending-cso`.
   - 112 is the only number dialled.
   - Payments are simulated, labelled "Demo payment · no money moved".

## Consequences

- The phone and the web show the same log, so a reading saved on one shows on the other. The web learns to label the four new kinds.
- Migration 0170 must be applied before mood, pulse, water, activity, the home pin or "N ahead of you" work. Until then those saves fail with a plain message, and the count is simply not shown.
- Danger readings still go straight to Help. The care team is not alerted, and the screens say so.
