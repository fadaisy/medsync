# ADR 0528 — The header Help steps aside only while the page draws its own red Help (amends law L6)

- **Status:** Accepted (owner, who is also the Clinical Safety Officer, in chat, 19 Nov 2026).
- **Date:** 19 Nov 2026
- **Relates to:** law L6 of the Tide v1 build (`docs/mobile-tide/PROMPT-MOBILE-TIDE-V1.md` §1, "Help is reachable on every screen"), ADR 0340 (Tide on the phone), ADR 0358 (the symptom steps and Book's "Something is wrong"), ADR 0524 (v2 is the phone default)

## Context

Law L6 puts the round red Help in the top-right corner of every phone screen, and the Help route crawl (`mobile/src/features/safety/help-crawl.test.ts`) holds every route to it. One exception already existed, approved by the owner on 19 Oct 2026: Book's "Something is wrong" card draws its own red Help that opens `/help`, so while that card shows, Book hides the header Help (`help={helpInPage ? "none" : "round"}` in `mobile/src/app/(app)/book/index.tsx` and `book/day.tsx`). Two red Helps one above the other read as two different things.

On 19 Nov 2026 the owner wrote: "help shouldn't be on every screen", and asked that the screens which lose it be found by following the rule Book already follows, not by taste.

## Decision

**A screen hides the header Help only while the page itself shows a red Help that opens `/help`, in view without scrolling, in that state, as the screen's main action.** The switch is the one Book uses: `help={helpInPage ? "none" : "round"}`, with `helpInPage` true only in that state.

Nothing else loses Help. No screen loses it because it is calm, a form, or a settings page. Signed-out screens, the splash and the welcome keep it. Help itself has none, as before (it is the destination). Outside this rule, **L6 stands as written**.

Applying the rule to every route under `mobile/src/app` (not `dev/`) and every state that draws a red `variant="danger"` button, or a `HelpNow`-style card, that leads to help:

| Screen and state                                                                                                                                                    | Decision                       | Reason                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Book, "Something is wrong" (`book/index.tsx`, `book/day.tsx`, `WhyComing` / `WrongAreas` → `HelpNow`)                                                               | Hides (unchanged, 19 Oct 2026) | The card's red Help opens `/help` and is the page's one action in that state.                                                              |
| Danger interrupt, first step ("Do you have any of these right now?", `(app)/danger.tsx`)                                                                            | **Hides**                      | "Yes, get help now" is red, first in the pinned footer (always in view), opens `/help`, and is the main action.                            |
| Danger interrupt, recheck step                                                                                                                                      | Keeps                          | The main action is the wait ("Start the 5 minutes" / "Measure again"); the red "Help" is a second, smaller button under it.                |
| Danger flow in Care mode, "Get help now" steps (`help`, `help_now`; `features/v2/my-care.tsx` `DangerFlowV2`, reported by `DangerFlowBody` in `my-care-routes.tsx`) | **Hides** (dark until Gate CG) | The large red "Get help now" opens `/help` and is the first thing under the words. `helpInPageFor(step)` decides.                          |
| Danger flow in Care mode, other steps                                                                                                                               | Keeps                          | Their red "I have one of these" moves the flow to its Help step; it does not open `/help`. The step's main action is the self-care step.   |
| Symptom checker, "What to do" for an emergency (`(app)/symptoms.tsx`, `features/symptoms/danger.tsx` `DangerResult`)                                                | Keeps                          | Its red "Get help now" opens the emergency lines (`/(app)/emergency/lines`) or crisis support, not `/help`.                                |
| Symptom checker, the in-list danger panel (`HelpPanel`)                                                                                                             | Keeps                          | Its red button calls the hospital or opens the emergency lines, not `/help`, and it sits in the list, not always in view.                  |
| Log a reading (`(app)/care/reading.tsx`)                                                                                                                            | Keeps                          | The red "Save and get help" is a save button; for a dangerous number it opens the danger interrupt, not `/help`.                           |
| Add, the reading sheet (`features/home/reading-sheet.tsx` on `(app)/add.tsx`)                                                                                       | Keeps                          | A sheet, not a screen; its red buttons open the danger interrupt, not `/help`.                                                             |
| Messages with the care team (`(app)/care/messages.tsx`, `MessagesV2`)                                                                                               | Keeps                          | The small red "Help" beside "not for emergencies" is not the page's main action; messaging is.                                             |
| Home and Today in Care mode, the danger card (`v2-hero.tsx`, `care-routes.tsx`)                                                                                     | Keeps                          | The card is red but its button ("What to do now") is not a red Help button, and the card is one item on a tab page with other actions.     |
| Activity (`(app)/care/activity.tsx`, `features/care-more/move-panel.tsx` safety card)                                                                               | Keeps                          | "I feel this now · Get help" opens `/help` but sits in a standing safety card below the activity; logging is the main action.              |
| Ask for a day, the symptom note's emergency advice (`features/visits/symptom-note.tsx` in `book/day.tsx`)                                                           | Keeps                          | The red "Help" opens `/help` but sits under the chosen symptoms, not always in view, and continuing the booking is the step's main action. |
| Help (`help.tsx`) and the emergency family (`emergency.tsx`, `(app)/emergency/*`)                                                                                   | Unchanged                      | Help is the destination; the emergency screens are its own family.                                                                         |
| Signed-out screens, the splash, the welcome, and every other route                                                                                                  | Keep                           | The rule removes Help only where the page draws its own; none of these do.                                                                 |

## Consequences

- One new case in code: the danger interrupt (`mobile/src/app/(app)/danger.tsx`), in its first step and, behind `careMode`, in the flow's Help steps. Nothing else changed. `careMode`, `GATE_CG_SIGNED` and every flag are untouched.
- The Help crawl names the new case (`IN_PAGE_HELP`, as it names `WrongAreas`): `danger.tsx` passes only while the switch is set by the first step, its "Yes, get help now" is `variant="danger"` and pushes `/help`, and the flow reports its Help steps. The general check is not loosened: any other `help="none"` still fails, and a `helpInPage` swap still needs a red Help of its own. `mobile/src/features/safety/help-in-page.test.tsx` renders each case and checks the in-page button is red and opens `/help`, and that the header Help returns on the recheck.
- The Tide v1 build prompt (`docs/mobile-tide/PROMPT-MOBILE-TIDE-V1.md`) is the historical gated-build prompt, as for ADR 0403's amendment of L8; it is left as written and this ADR is the amendment.
- A new screen that wants to hide the header Help must meet the rule above and be named in the crawl with its own proof.
- Not seen on a device when decided: held by tests.

## Alternatives considered

- **Hide Help on calm screens (forms, settings, records).** Rejected by the owner's own instruction: the rule is Book's, and a calm screen draws no Help of its own, so hiding it there would leave the screen with none.
- **Hide it wherever a red button exists.** Rejected: several red buttons open the emergency lines, the danger interrupt or the next step of a flow, not Help; and a red Help that is a second action, or below the fold, does not replace the header one.
