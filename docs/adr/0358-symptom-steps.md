# ADR 0358 — "Something is wrong" in three steps

**Status:** Accepted, 2026-10-19. Owner decision: prototype D on the Book canvas ("tick what fits, then a few questions") replaces the phone's symptom catalogue screens (S1–S4 of MS-PRD-SYM-001 §7, ADR 0098), which were in the old design and too complex for most people.

## Decision

1. **Step 1, what you feel.**
   - The body area tapped on Book opens first. A row of area chips changes it, and ticks are kept across areas.
   - The area's emergency signs sit in their own card, "Any of these, right now?". The other signs are plain tick rows.
   - "Not here? Say it in your words" takes free text.
   - Who it is for (me, a child and their age band, someone else, pregnant) stays at the top, because it changes which signs the catalogue shows.
2. **Step 2, a few questions.**
   - Each chosen item's own follow-up questions (the catalogue's qualifiers).
   - Then "When did it start?" with the five shared duration chips. The report has no duration field, so the answer leads the free text the clinic reads (`noteFor`).
   - No severity scale.
3. **Step 3, what to do.**
   - The tier as the catalogue's own word, one main door with the other under it, and "What the clinic will see" with Change.
   - Doors: E goes to Help; U to the same-day place, then today's line if there is none; R asks for a day.
   - The catalogue's own sentence closes every outcome.
4. **The emergency interrupt is in place, not a full-screen modal.**
   - It is still derived from the local classification, so an E item, a qualifier answer or a combination rule opens it.
   - It keeps the Warning haptic, `interrupt_shown`, `call_tapped` and `declined`, the call to the hospital's registered number, and "This is not happening now".
   - A self-harm item opens calmly (no red, no haptic) towards someone to talk to (PRD §5.5).
5. **What does not change.** Classification, submission, the server tier, the pending draft, Gate CS (off and draft watermark), and permanently light (Law 3).

## Consequences

- `mobile/src/components/symptoms` is removed. The new code is in `mobile/src/features/symptoms` (`logic.ts` is pure and tested, `steps.tsx`, `danger.tsx`).
- `danger.tsx` joins the Tide red allowlist (a clinical-safety review item).
- The S1 height budget and the "no sideways scroll" rule of PRD §7.2 no longer hold. The area chips scroll sideways in the owner's design.
- The phone surface tests are restated for the three steps.
