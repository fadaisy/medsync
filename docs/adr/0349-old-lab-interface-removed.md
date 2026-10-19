# ADR 0349 — Removal of the old lab interface; the redirect map

**Status:** Accepted — 2026-10-19 (D-UI-09). Still open: the parity checklist needs the CSO's signature, and the five-day pilot has not run.

## Decision

- **The map.** `lib/lab/redirects.ts` maps every old lab route to its new home: tab, place or record, with ids kept.
- **While the flag is on (Steps 3–10).** An old page answers 308 through `redirectIfV2`.
- **At Step 11:**
  - the old route files, the sidebar shell and the old nav rendering are deleted;
  - `next.config.ts` serves the map unconditionally;
  - the flag is removed.
- **Branch layout.** The removal is the last commit of `feat/lab-workspace-v2`, so a pilot can run from the commit before it.
- **Tests.** `tests/lab/workspace-v2/redirects.test.ts` walks every Step 0 route.
