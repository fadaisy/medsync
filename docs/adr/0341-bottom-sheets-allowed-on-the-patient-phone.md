# ADR 0341 — Bottom sheets are allowed on the patient phone app

**Status:** Accepted — 2026-10-17. Owner decision (Tide v1 plan, decision D3). This narrows ADR 0161 for the patient phone app (`mobile/`) only. ADR 0161 still governs the web and every staff surface.

## Context

ADR 0161 rules that pop-ups are centred landscape dialogs and that nothing slides in from an edge. On a phone held in one hand, the Tide boards log a reading and a dose on a sheet that rises from the bottom, within thumb reach. The flow is "two taps from the plus" (PRD F-05): the plus, then Save. A centred dialog would put the controls in the hard-to-reach middle of the screen and add a step.

## Decision

1. **On the patient phone, short in-place tasks may use a bottom sheet:** `mobile/src/components/tide/sheet.tsx`, `Sheet`.
   - The sheet rises from the bottom over a scrim, with a grab handle, an overline, a title and ✕.
   - The scrim, ✕ and the system back close it.
   - It rises with `motion.sheetUp`, which becomes a fade under reduce motion.
2. **Only for a task that finishes on the sheet.** Today these are log a reading and "Which one did you take?" from the plus. Anything longer, or anything that needs its own Back, is a pushed screen.
3. **Nothing slides in from a side.** There are no side sheets or drawers, as ADR 0161 rules.
4. **A sheet is never the danger interrupt.**
   - A dangerous reading is saved first. The sheet then becomes a red danger card that sends the patient to `/danger` or Help.
   - Help and Danger are full screens, forced light (law L11).

## Consequences

- The plus-to-Save path stays at two taps, and the analytics event `reading_saved` records `entry: "sheet"` and the tap count, so this can be measured.
- The rule stays narrow: one component and two uses. Any new sheet is a review against point 2.
