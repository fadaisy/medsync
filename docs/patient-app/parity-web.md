# Patient app v2 · Parity report · Web (Step 12, draft)

**Status: draft, not signed.** The prompt asks for a signed parity report per platform: every Step 0 item present in v2 or in `renames.json` with a signed reason. This draft is for the owner and the CSO to check and sign.

**How to read it.** Rows follow the signed feature matrix (`docs/patient-app/feature-matrix.md`). Each row says where the feature is now:

- **v2**: rebuilt in v2, behind the flag, at the step named.
- **Kept**: the current screen is unchanged and still serves. Nothing is lost, but it has no v2 design yet.
- **Gap**: the matrix asked for a v2 change that this slice did not build.
- **Deferred**: the owner deferred it.

Nothing is dropped. The old screens and routes are still in place, and the v2 flags are off: that cutover comes after the owner's 5-day pilot. `renames.json` holds no removals (`dropped: []`).

**In short:** 21 rows have v2 work, 27 keep the current screen, 13 carry a gap, 0 deferred.

| #              | Feature                            | Now             | Notes                                                                                     |
| -------------- | ---------------------------------- | --------------- | ----------------------------------------------------------------------------------------- |
| 1.1            | Navigation per mode                | Kept            | Current Tide shell. Per-mode navigation and the ≥ 761 px top bar are not built: **Gap**.  |
| 1.2            | The + button                       | Kept            |                                                                                           |
| 1.3            | Header                             | Kept            | Avatar count not built: **Gap**.                                                          |
| 1.4            | Help pill                          | Kept            | Red Help on every page (guards pass).                                                     |
| 1.5            | Toasts                             | Kept            |                                                                                           |
| 1.6            | Offline                            | Gap             | No offline banner yet. A typed reading is kept in the page.                               |
| 1.7            | Notifications                      | Kept            |                                                                                           |
| 1.9            | Links                              | Kept            | `/patient/...`; legacy routes redirect (MOVED list).                                      |
| 1.10           | Analytics                          | Gap             | New events not added.                                                                     |
| 1.12           | Theme                              | Kept            |                                                                                           |
| 1.13           | Galleries                          | v2              | `/pw/gallery/v2`, `visit-v2`, `care-v2`, `me-v2`: fixtures, axe, screenshots.             |
| 2.1–2.4        | Sign in, sign up, details, consent | Kept            |                                                                                           |
| 3.1            | Home                               | Kept            | Web Home v2 not built: **Gap**.                                                           |
| 3.2            | Feeling shortlist in Book's why    | v2 (Step 5)     | Book v2 asks why.                                                                         |
| 3.3            | Something is wrong                 | Kept            |                                                                                           |
| 3.4            | Book                               | v2 (Step 5)     | One page (W1); S11 = 3 clicks on the page.                                                |
| 3.5            | Doctor page                        | Kept            | Doctor's-times flow unchanged (owner, STOP 5).                                            |
| 3.6            | The ticket                         | v2 (Step 5)     | All widths.                                                                               |
| 3.7            | Visits                             | v2 (Step 5)     | Offers, upcoming, past, month calendar by person (7.10).                                  |
| 3.8            | One visit, the day                 | v2 (Steps 5, 6) | Ticket, ics, directions, text, stages, questions, money.                                  |
| 3.9            | Offers                             | v2 (Step 5)     |                                                                                           |
| 3.10           | Confirm, rate                      | Kept            | Current controls under the v2 page.                                                       |
| 3.11           | Household                          | Kept + v2       | Household payer (Step 6).                                                                 |
| 3.12           | Records                            | Kept            |                                                                                           |
| 3.13           | Pre-arrival                        | Kept            |                                                                                           |
| 4.1–4.4        | Emergency                          | Kept            |                                                                                           |
| 4.5            | Danger dialog                      | v2 (Step 9)     | In place of the reading form, behind `careModeOn()`; S23. Words pending CSO.              |
| 4.6            | Location share                     | Kept            | None on the web, as agreed.                                                               |
| 5.1            | Care hub                           | v2 (Step 9)     | Today, behind `careModeOn()` (needs Gate CG).                                             |
| 5.2            | Medicines                          | Kept + v2       | v2 Plan shows plan medicines; the merge with patient-entered and hand-overs is a **Gap**. |
| 5.3            | Log a reading                      | Kept + v2       | `?kind=` (S22); care-mode save tells the team.                                            |
| 5.4            | Trends                             | Kept            | Details opens it. The v2 Readings page (tabs, large chart, table) is not built: **Gap**.  |
| 5.5, 5.6, 5.10 | Move, mood, food                   | Kept            | Wellness hub on the web not built: **Gap**.                                               |
| 5.7            | Labs and results                   | Kept            | Port not done: **Gap**.                                                                   |
| 5.8            | Messages                           | v2 (Step 9)     | My care, two columns.                                                                     |
| 5.9            | Conditions, allergies, family      | Kept            |                                                                                           |
| 6.1            | Card                               | v2 (Step 10)    | Front, back, turn over, QR (S24).                                                         |
| 6.2            | Places                             | Kept            |                                                                                           |
| 6.3            | Hospitals                          | Kept            |                                                                                           |
| 6.4            | Settings                           | Gap             | v2 settings list not built.                                                               |
| 6.5            | SMS consent                        | Kept            |                                                                                           |
| 7.1            | Today, plan as a day               | v2 (Step 9)     | S21.                                                                                      |
| 7.2            | Plan page                          | v2 (Step 9)     | Goals not built: **Gap**.                                                                 |
| 7.3            | My care                            | v2 (Step 9)     | Checks read Due until results link.                                                       |
| 7.4            | Booking payments                   | v2 (Steps 5, 6) | Sandbox; desk Paid within 5 s (S16).                                                      |
| 7.5            | Questions for the doctor           | v2 (Step 5)     |                                                                                           |
| 7.6            | Called banner                      | Gap             | Not wired.                                                                                |
| 7.7            | Plus                               | v2 (Step 10)    | Sandbox.                                                                                  |
| 7.8            | My care pulse                      | Gap             |                                                                                           |
| 7.10           | Calendar by person                 | v2 (Step 5)     |                                                                                           |
