# ADR 0360 — MedSync Tide is the single web design system

**Status:** Accepted — 2026-10-21, signed by Fadhul (CSO) at GATE A of `PROMPT-TIDE-WEB-MIGRATION.md` (D-TW-01, 02, 03, 04, 08, 11, 12). Supersedes ADR 0162 (MedSync Chroma) once Step 10 deletes Chroma.

## Decision

- Every web surface renders in MedSync Tide (`docs/design/tide/`), at three densities: desk (staff and admin), phone (patient web) and public. `DESIGN-medsync.md` is rewritten to match.
- Figtree for all text, Geist Mono for identifiers only. Bricolage Grotesque and Geist sans go at Step 10.
- "Emergency" on staff routes, "Help" on patient and public routes: the same red, the same place.
- The colour laws apply app-wide. Lagoon acts, navy holds, plum is place, red is a safety property, amber is caution with a word, green is clinical only.
- The guards are app-wide: red reserved (existing), and `tests/design/tide-guards.test.ts` as ratchets on native dates, left bars and raw hex, which reach 0 at Step 10.
- The lab is not redesigned (D-TW-13).
