# ADR 0169 — Clerking desk v2 on a phone

**Status:** Accepted — 2026-09-27. PROMPT-CLERKING-MOBILE; D-CM-01 to D-CM-07 signed by the CSO as recommended (`docs/emr/clerking-v2/mobile/gate-proposal.md`).

## Decision

Below 640 px (Tailwind `sm`) the v2 clerking desk has its own arrangement of the same components. 640 px and up is unchanged: every phone rule is a `max-sm:` class or an `sm:hidden` element.

1. **Two fixed bars, one scrolling page.**
   - The top bar is 50 px: ‹ Workspace, Emergency, and an avatar whose menu holds the cadre, hospital, department and Sign out (D-CM-01). The v1 desk keeps its old bar (`phone={false}`).
   - The bottom bar has Previous and "Next: {step}", or "Review and sign" on the last step (D-CM-06). It hides while a text field has focus.
2. **Patient header.** Name, Draft, age · sex · MRN, the save line, and four context tiles that open the Context sheet (D-CM-03). It scrolls away (D-CM-02).
3. **Sticky step bar.**
   - The step label appears once on screen, with the Note button and its flag count and a 10-segment progress line.
   - Once the header has gone, the bar shows the name and MRN. The MRN never truncates (Law 9).
4. **Group, don't nest.** Each form group is a panel (`PANEL` in `controls.tsx`), and bordered cards inside a panel become hairline rows.
   - Past history orders its panels Allergies, Medicines, Conditions, then Operations.
   - Social has one panel per group; Lives and Activity share "Home and activity".
   - The review of systems shows each status on its own line, never truncated.
5. **Bottom sheets (D-CM-05).** `EmrDialog` takes `sheet` (or `"tall"`). It is the same base-ui dialog with the same focus trap, Esc and focus return, anchored to the bottom below 640 px with a grab handle and a swipe-down close. It is used for Steps, Context, Note and flags, the complaint sheet, Details, Show all and the pick lists. ADR 0161 is unchanged at 640 px and up.
6. **Badges where the answer is (D-CM-04).** On the phone only, complaint rows and positive system items carry their flag badges.
   - The badges use the same words, icons and tints as the Flags list.
   - Red stays in `flags-panel.tsx` (`InlineBadges`, `FlagCount`).
7. **Touch (D-CM-07).** Chips are 36 px and yes/no halves 32 px, each with hit slop to 44 px. Chip rows have 8 px gaps. Fields are 16 px, so iOS does not zoom.

## Consequences

- No new dependency. Phone state is one `matchMedia` hook (`usePhone`) and one `IntersectionObserver` (`useScrolledPast`).
- The phone shell renders on the server, hidden by CSS from 640 px up, so first paint does not shift.
- The examination phone design is out of scope and comes with its own prompt.
