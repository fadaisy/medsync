# ADR 0524 — Patient app v2 is the phone's default; the old screens stay only as fallback

- **Status:** Accepted (owner, in chat, 18 Nov 2026). Nothing reaches patients until a new phone build is released, which is the owner's call.
- **Date:** 18 Nov 2026
- **Relates to:** the patient app v2 gates (`docs/patient-app/gate-a-proposal.md`, feature matrix), ADR 0340 (Tide on the phone), ADR 0517 (two modes), `docs/patient-app/parity-phone.md`

## Context

Patient app v2 on the phone sat behind a build switch, `appV2Mobile`. The plan was a 5-day pilot at one hospital with the switch on, then the cutover: remove the old screens and keep redirects (REPORT.md §4). On 18 Nov 2026 the owner opened the app with the switch on and it "is still showing the old UI": the switch only swapped a few screens inside the old shell. After the phone got its own shell, Home and brand (finish pass 1, same day), the owner chose: "let the v2 ui replace the old", "v2 by default, old as fallback", "Phone only".

## Decision

- **The `appV2Mobile` switch is removed.** Every phone screen that has a v2 version shows it always: the Visit-mode shell (Home, Book, Visits, Me), Home, the Visits list, the day of a visit, the pay step when asking for a day, the membership card on Me, Wellness, and the Tether name.
- **An old screen stays where v2 has no version of what it does, and stays reachable from the v2 shell.** No feature is lost. Today that is:
  - confirming ("I'm here", "I'm coming"), moving and cancelling a visit: the current visit screen, opened from the v2 visit page ("Confirm, move or cancel");
  - the week calendar with the clinic's open days: the current Visits screen, as the "Week" view beside the v2 list;
  - the Care screen (medicines, trends, lab tests, move and eat) and everything it opens: linked from Home ("Your care") while Care mode is locked;
  - "See a doctor" and the doctor's own times: the current list, now on the v2 Home;
  - the health card that works offline, the settings rows and every other row of Me: unchanged, under the membership card;
  - every Kept row of `parity-phone.md` (sign-up, Book, records, places, household, Help, emergency, notifications and the rest).
- **Old code that a v2 screen fully replaces is removed**: the old "your day" Home (its mood, doses and readings are on the Care screen and Wellness; its doctors list moved to the v2 Home), the old pay-now step when asking for a day (it simulated a payment), and the MedSync wordmark. The old tab bar component stays in the kit for the dev gallery.
- **Care mode does not move.** `careMode` and `GATE_CG_SIGNED = false` are exactly as they were. Every check that read `appV2Mobile && careMode` now reads `careMode`. Care screens stay locked until the CSO signs Gate CG.
- **Payments do not move.** `mobilePayments` is unchanged and off. Where v2 offers Mobile Money (asking for a day, a visit's bill, a Plus plan) it does so only when `mobilePayments` is on; otherwise the page says the visit is paid at the hospital, the bill shows the cash office, and a paid plan says paying from the app is not switched on. The free month needs no payment.
- **Phone only.** The web's `appV2Web` and `PATIENT_FLAGS` are untouched.

## Consequences

- **Unsigned draft wording is now the phone's default.** The v2 strings in `content/patient-app/` are drafts; no `*_COPY_STATUS` was changed. The CSO's sign-off is needed before a release build.
- The 5-day pilot no longer has a switch to turn on for one hospital on the phone: a build either has v2 or is an older build. The parity reports are still unsigned; the gaps in `parity-phone.md` stand, served by the screens above.
- The phone says Tether everywhere a patient reads, except the data-processing consent, which keeps its legal text until the owner re-issues the notice (as on the web). The native splash image, the app name and the icon still say MedSync until a new build changes them.
- Guards: `mobile/src/lib/flags.test.ts` (no screen reads `appV2Mobile`; the environment cannot unlock Care mode; each Care screen still checks `careMode`), the Help crawl (law L6), the colour laws and the route parity test (`renames.json`: every route still exists).
- Not seen on a device when decided: checked in a browser at phone width and by tests.
