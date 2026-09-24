# ADR 0111 — Resus Desk v2: go-live sign-off (CSO sheet)

**Status:** Proposed — awaiting the CSO's signature (prepared 2026-09-24)
**Context:** GATE A (2026-09-23) was signed by instruction, leaving items "to be confirmed at the final review before the
clinical flag is switched on". The build is complete (`docs/resus-v2/STOP-REPORTS.md`, final report) and ships with
`RESUS_DESK_V2` unset, so clinicians keep the v1 desk until this sheet is signed. This ADR is the record of that decision.

**How to use it:** every item says what the desk does now, where to look, and a recommendation. Tick **Confirm** or write
the change you want. Items marked **(CSO action)** need you to read or test something yourself; everything else is a
decision on the evidence given. When every box is ticked, sign the Decision block at the end.

## A. GATE A answers marked "confirm" (`docs/resus-v2-gate-a-proposal.md` §12)

| #   | Decision as built                                                                                                                                                  | Recommendation                                                               | Decision                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------- |
| A1  | **D16** — after close the episode is read-only; no clinical addendum in v2. Debrief and after-death tasks stay editable for 24 h as separate records.              | Confirm. A late correction is a new note on the patient's encounter.         | [ ] Confirm [ ] Change: … |
| A2  | **D19** — "Spinal injury" in the context bar also sets A's trauma / C-spine flag (so A shows jaw thrust / C-spine protection).                                     | Confirm (suspected spinal injury ⇒ protect the C-spine).                     | [ ] Confirm [ ] Change: … |
| A3  | **D22** — the one-tap arrest adrenaline records 1:10,000; a 1:1,000 IV entry must go through the prescribe dialog with an override reason (look-alike guard kept). | Confirm (ANZCOR allows 1:1,000 IV; the house stays with the RCUK dose form). | [ ] Confirm [ ] Change: … |

## B. Sources automation could not open — D25 **(CSO action: read in a browser)**

Every other number was downloaded and text-matched against RCUK 2025 / AoMRC 2025 / ANZCOR (`docs/clinical/resus-als-clinical-catalog.md`
§ Verification). These were carried from the CSO reference and must be read by a person:

| #   | Source (catalog code)                                                                          | What to check                                                                                            | Read |
| --- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---- |
| B1  | Utstein IHCA 2019 (UTS-IH19) — https://www.ahajournals.org/doi/10.1161/CIR.0000000000000710    | Sustained ROSC = 20 min without compressions (ALS-ROSC-03); the core field list (CO-UTS-01..09)          | [ ]  |
| B2  | In-hospital Utstein 1997 (UTS-IH97) — https://www.ahajournals.org/doi/10.1161/01.cir.95.8.2213 | Re-arrest after > 20 min ROSC is a new arrest record (ALS-ROSC-05)                                       | [ ]  |
| B3  | AHA 2025 BLS (AHA-BLS25)                                                                       | 2-min compressor rotation (the console prompts the swap at the RCUK 2-min pause; no AHA number is shown) | [ ]  |
| B4  | AHA 2025 ALS (AHA-ALS25)                                                                       | Energy wording is Class 2b "may be reasonable"; no AHA joule values are used (RCUK values are)           | [ ]  |
| B5  | ERC 2025 Ethics, publisher version (ERC-ETH25)                                                 | 20-min persistent-asystole criterion (D1) — matched the accepted author version only                     | [ ]  |

## C. Choices made while building (final report, "For the CSO")

| #   | What the desk does                                                                                                                                                                                                              | Recommendation                                                                                | Decision                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------- |
| C1  | **Re-arrest after ROSC is one tap** with Undo in the toast (signed ALS-ROSC-07); the first arrest of an episode still goes through the multi-sign confirm (D20).                                                                | Confirm — the team is at the bedside and seconds matter; Undo covers a mis-tap.               | [ ] Confirm [ ] Change: … |
| C2  | **Unknown age = adult protocol**; the console shows "Age not recorded — adult protocol". Children (< 16) get clocks and logging only, no numbers.                                                                               | Confirm, and teach "record the age" at triage; an obvious child → record an estimated age.    | [ ] Confirm [ ] Change: … |
| C3  | GCS verbal "T" (intubated) counts as verbal 1 in the total, as v1 (E3 VT M5 = 9).                                                                                                                                               | Confirm (v1 parity).                                                                          | [ ] Confirm [ ] Change: … |
| C4  | "Record findings" is disabled while nothing changed, so an "unchanged on reassessment" time cannot be written from the panel.                                                                                                   | Confirm for go-live; add a "Reassessed — no change" button as a follow-up.                    | [ ] Confirm [ ] Change: … |
| C5  | **Time of death** = the bedside tap time (server-anchored), kept when the confirmation was queued offline; must be ≥ 5 min after the observation started. _Changed 2026-09-24 from "server receive time"._                      | Confirm (AoMRC 2025: the time the clinician is satisfied).                                    | [ ] Confirm [ ] Change: … |
| C6  | After "Stop resuscitation" with no return of function, or after a confirmed death, End resus offers only "Died" or "Opened in error" — "Transferred out" is refused.                                                            | Confirm.                                                                                      | [ ] Confirm [ ] Change: … |
| C7  | Wording: anaphylaxis / modifier texts say "≤ 1 µg/kg" with LAST and "adrenaline withheld while core < 30 °C" (ALS-DRG-06, MOD-01, MOD-10).                                                                                      | Confirm.                                                                                      | [ ] Confirm [ ] Change: … |
| C8  | Lidocaine below 30 °C or with LAST shows **no dose** ("no signed lidocaine rule — senior decision").                                                                                                                            | Confirm now; add a signed row if the hospital uses lidocaine as its antiarrhythmic (D5).      | [ ] Confirm [ ] Change: … |
| C9  | The low-ETCO₂ PE hint (ALS-RC-09) no longer marks Thrombosis "suspected" by itself — the record cannot show adequate ventilation and compressions.                                                                              | Confirm.                                                                                      | [ ] Confirm [ ] Change: … |
| C10 | Children: PE-lysis text "prolonged resuscitation (weight-based — PLS module not built)"; no ETCO₂ PE hint; BMI > 40 reads "standard ALS" without "standard energy". _BMI wording changed 2026-09-24 (ALS-MOD-16: no energies)._ | Confirm.                                                                                      | [ ] Confirm [ ] Change: … |
| C11 | NEWS2 (level of care, boarding, SBAR) scores the newest resus vital set only, artefacts excluded; incomplete set ⇒ no NEWS2 and the leader chooses.                                                                             | Confirm (never mixes readings).                                                               | [ ] Confirm [ ] Change: … |
| C12 | SV-CTX-18: a flag recorded on a v1 assessment is kept even if the context bar later turns it off.                                                                                                                               | Confirm (a v1 record is never silently dropped).                                              | [ ] Confirm [ ] Change: … |
| C13 | Pregnancy: gestation weeks also asked for "Postpartum"; decimals round to whole weeks (20.6 → 21, i.e. > 20 w — uterine displacement applies).                                                                                  | Confirm (rounding up is the safer side).                                                      | [ ] Confirm [ ] Change: … |
| C14 | Record shows drug doses as "1 mg · 1:10 000 (100 micrograms/mL) — … (10 mL bolus)".                                                                                                                                             | Confirm (concentration stays explicit).                                                       | [ ] Confirm [ ] Change: … |
| C15 | Kept for v1 parity: during an arrest an empty A/B/C assessment classifies from the arrest state; D/E can read "Clear" during an arrest.                                                                                         | Confirm (the arrest console is the working surface then).                                     | [ ] Confirm [ ] Change: … |
| C16 | Phones: vitals strip and step rail wrap instead of scrolling sideways (deviation from PROMPT §5.1); the "from vitals · not assessed" qualifier is in the accessible name only below 768 px.                                     | Confirm (a critical value or the active-threat step is never off-screen).                     | [ ] Confirm [ ] Change: … |
| C17 | Light-mode primary buttons are white on `#0D9488` — 3.74:1, below WCAG AA for body text (design-system token, app-wide).                                                                                                        | Change (owner design decision): primary fill → teal-700 `#0F766E` (5.47:1), hover → teal-800. | [ ] Confirm [ ] Change: … |

## D. Legal (D10) **(CSO action)**

| #   | Item                                                                                                                                                                    | Recommendation                                                                                      | Decision                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| D1  | Who may confirm death, certification (CO-ADT-06) and reportable deaths (CO-ADT-03) in Uganda. The desk records facts and shows the task list; it decides nothing legal. | Obtain a short legal opinion; go-live may proceed with the checklist as local practice, noted here. | [ ] Reviewed [ ] Go live noting "not legally reviewed" |

## E. Acceptance on a test deployment **(CSO action, with a colleague; never production data)**

Prerequisites: a **test** Supabase project with every migration through `0068` applied (run from the main tree —
`0067_intake_route.sql` is still uncommitted there); the pilot hospital's care units and bay
defibrillators loaded with `scripts/seed-resus-units.ts`; `RESUS_DESK_V2=1` on that deployment only.

| #   | Check                                                                                                                                                                                                        | Pass |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| E1  | Live RLS suites green: `MEDSYNC_ALLOW_RLS_DB_WRITES=1 npx vitest run tests/rls/resus-tables.test.ts tests/rls/resus-v2-tables.test.ts`                                                                       | [ ]  |
| E2  | S0 — triage rapid-Red "no pulse" opens the desk straight in the arrest console; the arrest call names the place, never the patient                                                                           | [ ]  |
| E3  | S1 — VF: shocks 1–3 → adrenaline + amiodarone 300 → shock 5 → amiodarone 150 → ROSC; each event one tap                                                                                                      | [ ]  |
| E4  | S2 — PEA → asystole > 20 min → termination review → stop → 5-min observation → death confirmed (time of death = your tap)                                                                                    | [ ]  |
| E5  | S3 — core 28 °C: adrenaline withheld (tap opens the dialog), shocks paused after 3; at 30 °C adrenaline due, 6–10 min interval                                                                               | [ ]  |
| E6  | S4 / S4b — re-arrest at 8 min keeps arrest #1; after 30 min sustained ROSC a re-arrest opens arrest #2 with totals visible                                                                                   | [ ]  |
| E7  | S5 — a 9-year-old: clocks and logging only, no number anywhere                                                                                                                                               | [ ]  |
| E8  | S6 — two devices on one episode: cycle timers within 1 s; an entry on one shows on the other within 2 s                                                                                                      | [ ]  |
| E9  | Wi-Fi off 60 s mid-arrest: entries show "waiting", nothing lost or duplicated on reconnect                                                                                                                   | [ ]  |
| E10 | S7–S11 — stabilised → ward; comatose → ICU suggested → ICU full → HDU with reason → boarding → left; opened in error → cancelled; idle legacy → administrative close; End resus mid-arrest asks how it ended | [ ]  |
| E11 | Every check above on a phone **and** a tablet, light and dark                                                                                                                                                | [ ]  |

## F. Known deferrals (accept, or require before go-live)

[ ] Accepted as follow-ups: resus red-scarcity source test and fast-path look-alike / witness tests (behaviour exists);
the daily idle-sweep cron (the 12 h notice is sent when the board renders); network-drop / realtime / performance suites
(E8–E9 cover them by hand); "not available here" answers not yet feeding capability data; the board keeps the floating
Emergency button; v2 is one flag for every hospital (no per-hospital pilot switch).

## Decision

```
Go-live of Resus Desk v2:   [ ] Approved   [ ] Approved with conditions: ………………   [ ] Not approved

CSO (Clinical Safety Officer): ……………………………        Date: ……………
Tester (E): ……………………………                          Test deployment URL: ……………
```

On approval: set `RESUS_DESK_V2=1` in the Vercel production environment, redeploy, and record the deployment ID here.

## Consequences

The flag goes on only with every A–F box resolved; a "Change" answer is implemented and re-tested before signing.
Supersedes nothing; completes GATE A's deferred confirmations (ADRs 0102–0110).
