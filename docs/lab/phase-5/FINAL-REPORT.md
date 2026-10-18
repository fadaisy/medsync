# Lab Phase 5: final report (STOP 11)

17 Oct 2026, branch `feat/lab-beyond-lis` (local commits only; not pushed). Phase 5 takes the laboratory beyond a
standard LIS: patients see their own results through one safe gate, delta checks catch wrong-patient samples before
release, and released results feed infection prevention. Autoverification and the microbiology feed were conditional
and are gap reports. At the owner's request it also adds a lab-only demo loader and a full laboratory documentation
set (`docs/lab/LAB-DOCUMENTATION.md`).

## What was built, by step

| Step | What                                                                                        | Evidence                            |
| ---- | ------------------------------------------------------------------------------------------- | ----------------------------------- |
| 0–1  | Discovery, IDSR transcription, GATE A (signed as recommended), hazard log                   | `STOP-REPORTS.md` STOP 0–1          |
| 2–3  | Migrations 0154–0157, Drizzle schema, pure engines                                          | `lab-phase5-data` lane; unit tests  |
| 4    | Delta checks in the result path, decision panel, rules page, RCV calculator, trial          | `lab-delta` S1–S10                  |
| 5    | IPC feed, `/ipc` workspace, readmission trigger, escalation, bed-board flag                 | `lab-ipc` S11–S20                   |
| 6    | Release rules, "The patient sees it", told, holds, notes, aged results, set-up page         | `lab-patient-release` S21–S27       |
| 7    | Patient Results area, consent wording and versions, guardians, views, copy requests         | `lab-patient-results` S28–S38       |
| 8    | Results-ready SMS: own sender, hours, batching, STOP, retries                               | `lab-results-sms` S39–S43           |
| 9–10 | Autoverification and microbiology: gap reports                                              | `autoverify-gap.md`, `micro-gap.md` |
| —    | Demo lab day for demo hospitals                                                             | `lab-demo` lane                     |
| 11   | Property test, budgets, harness screenshots and axe, hazard closure, guides, ADRs 0328–0339 | this report                         |

## Section 13: scenarios

S1–S34 and S36, S38–S43 pass on the PGlite lanes (real stores, all migrations, RLS). S35 passes by construction and in
the harness (tab titles carry no PHI; nothing is stored on the device; the service worker caches only `/offline`).
S37: the patient pages render at 390 px and in dark mode with the Emergency button and no sideways scroll; the 3G budget
on a real mid-range Android phone is not measured (no device trial). S44–S58 are not run (Steps 9 and 10 are gaps).

## Checks

- **Unit suite:** 10,286 tests across 442 files; the one failure found in the full run (a source-pinning test for the
  STOP handler) was updated with the change and passes.
- **Phase 5 lanes** (`EMR_PGLITE=1`, with Drizzle parity): 362 tests in 8 files, all pass; the patient-results lane
  grew to 9 tests after the harness found a bug (below).
- **Property:** 200,000 random snapshots, viewers and signed settings; no never-shown test is ever visible
  (`tests/lab/phase-5/hardening.test.ts`).
- **Budgets (server, pure parts):** `visibleToPatient` over 500 results well under 50 ms; delta evaluation well under
  1 ms per component. Database-backed budgets (review to visible, SMS enqueue, IPC alert after release) are bounded by
  the minute tick; not measured on production hardware.
- **Harness** (`~/Desktop/lab5-harness`, production build over a PGlite fixture seeded through the stores): 26 page
  states (lab set-up, delta panel, demo, doctor's results, three IPC pages, governance desk, patient list and result at
  1440 and 390 px, light and dark): **0 axe findings, no sideways scroll**. Screenshots in
  `docs/lab/phase-5/shots/`.
- Typecheck and lint clean; `npm run build` passes in the harness copy.

## Found and fixed during hardening

1. `patient_result_views` refused the device class "computer" (0154 allows phone, tablet, desktop, unknown): every
   desktop view of a result failed. Fixed in `recordView`; the lane now records all four classes.
2. The governance desk opened only where referrals were on, so a hospital with patient results but no referrals could
   never sign the consent wording (and no patient could turn results on). It now opens for either; the referral
   sections show only with referrals (ADR 0339).
3. The one-result page skipped a heading level when a test has one component (axe `heading-order`); fixed.
4. Earlier in the phase: 0154's `consent_versions` constraint name, and the IPC condition on the bed board (ADR 0336).

## Definition of done: state

| Item                                                  | State                                                                  |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| All in-scope steps built behind flags, off by default | Done                                                                   |
| Hazard log closed against tests                       | Done (scores for the CSO and lab lead)                                 |
| ADRs and CHANGELOG                                    | ADRs 0328–0339; CHANGELOG entry                                        |
| User guides                                           | `user-guide.md`                                                        |
| Phase 5 copy signed by the CSO                        | **Open** (`LAB5_COPY_STATUS` is draft)                                 |
| Migrations 0154–0157 applied                          | **Open** (owner)                                                       |
| Patient access in production                          | **Blocked** on Q7 (legal opinion) and Q8 (privacy notice, terms, PDPO) |
| Delivered SMS on a test handset                       | **Open** (sender registration, Q11)                                    |
| Phone trial and 3G budget                             | **Open**                                                               |

## Owner actions, in order

1. Review the branch; push when ready (Claude has not pushed).
2. Apply migrations from this folder: `cd ~/Desktop/medsync && npm run db:migrate` (0154 → 0155 → 0156 → 0157).
3. Sign `LAB5_COPY_STATUS` in `content/lab-phase-5.ts` after reading the copy (Appendix A plus the chip words added in
   Step 6).
4. Redeploy the `system-ussd-act` Edge Function (STOP now also revokes `results_sms`).
5. Name the data protection lead, IPC lead, IPC link nurse and surveillance focal person; the focal person checks
   `idsr-transcription.md`.
6. Before patients: Q7 and Q8; then the consent wording, release table, plain words and minors rule are signed in the
   product.
7. Hazard scores; the remaining items in `docs/lab/LAB-DOCUMENTATION.md` §17.

## Gaps carried forward

No offline copy of results (stricter than asked); English only for explanations and SMS; the head of department's
aged-results view; a navigation link for copy requests; the sender ID per hospital; "live" IPC is a page refresh;
autoverification; microbiology.
