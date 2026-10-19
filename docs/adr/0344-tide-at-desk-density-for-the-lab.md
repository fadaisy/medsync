# ADR 0344 — MedSync Tide at desk density for the lab workspace

**Status:** Accepted — 2026-10-19 (D-UI-01, D-UI-02, D-UI-11). For `/lab` only, it supersedes ADR 0340's "Tide is mobile only" and ADR 0162's Chroma. Every other staff workspace stays on Chroma. The `DESIGN-medsync.md` lab section needs the CSO's signature.

## Decision

- **Tokens.** `:root:has([data-lab-tide])` in `app/globals.css` re-pins the ink ramp and the semantic roles to Tide's ground, navy ink and white cards, and adds the `--tide-*` tokens as utilities.
  - It applies only while the lab shell is on the page. Dialogs and popovers portal to `<body>` and still get the tokens.
  - Primary (links, focus) stays teal-700, which is Tide's `accent-text`.
  - The lagoon fill (`bg-tide-lagoon` with `text-tide-on-lagoon`) is the one primary action per region.
- **Fonts.** Figtree is loaded through `next/font` without preload, so only lab pages fetch it. Geist Mono is for identifiers only.
- **Desk sizes.** Body 13–14px, page title 24/28 at weight 500, buttons 36 (small 30), rows of at least 44, rail items of at least 54. Radii: cards 18, tiles 16, rows 12, fields 10.
- **Not adopted:** Tide's `shadow-accent`, because it is a glow and DESIGN forbids glows.
- **Dark.** The dark values are written but the lab ships light.
- **The lab's colour laws stay:**
  - red only for criticals and Emergency;
  - amber for late, held, delta waiting, overdue, quarantined and down;
  - **nothing green**.
