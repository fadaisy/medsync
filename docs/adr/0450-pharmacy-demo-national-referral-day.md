# ADR 0450 — The pharmacy demo: one press fills every pharmacy page

**Status:** Accepted — 26 Oct 2026 (owner request: "it's for the whole pharmacy workspace, all of it. Make one for a national level hospital"). Built on `feat/pharmacy-demo`; migration 0250 is GATED and owner-applied.

## Context

The Phase 4 fixture demo shows only the network pages, from fixtures. The owner wants a real hospital's database filled so every pharmacy page can be walked through, as the lab demo does ([ADR 0338](0338-lab-demo-hospitals-and-the-demo-lab-day.md)).

## Decision

1. **Where.** Only a hospital a superadmin marked in `lab_demo_hospitals` (one mark serves the lab and the pharmacy). The hospital admin presses "Load the pharmacy demo" at `/hospital-admin/departments/pharmacy/demo`; anywhere else the loader refuses.
2. **Shape.** A national referral day: eight dispensing points live for 40 days, six clinics, six wards, about 50 demo staff, 60 patients "Demo patient NN" (outpatients, NCD and ART clinic patients, inpatients), about 70 general-formulary medicines stocked, and a month of history behind today.
3. **Through the real stores.** Every workflow state is written by the store the app's own action calls (`runPharmacyWrite`), as demo staff of the right cadre and point, so every state shown is one the app can reach. Plain inserts only for rows the PGlite tests also insert directly (prescriptions, encounters, MAR).
4. **Doses.** Every dose, frequency and direction reads `[demo dose]`. No strengths.
5. **Signing.** Packs and content are signed by "Demo chief pharmacist" and "Demo clinical safety officer", two different demo people, in the demo hospital only, as the owner ruled for the lab demo (18 Oct). Content wording reads as demo.
6. **Legal answers are never filled in**, so go-live readiness keeps saying they are missing.
7. **Accounts.** Every demo person is an account that cannot sign in (an `.invalid` address, banned for a century). Each load is recorded in `pharmacy_demo_loads`; its patients in `pharmacy_demo_patients`.
8. **Failure.** Setup failing stops the load; any later section that fails is noted on the load and the rest carry on. Nothing is rolled back or removed: pharmacy records are append-only and the demo hospital is the sandbox.

## Consequences

`tests/emr-db/pharmacy-demo*.test.ts` load the demo on PGlite and read each page back through its own loader. To see it, the demo hospital must be listed in the pharmacy flags and in `PHARMACY_DEV_HOSPITALS` (map v2), and the viewer's own pharmacist account must be affiliated with the hospital's PHARMACY department.
