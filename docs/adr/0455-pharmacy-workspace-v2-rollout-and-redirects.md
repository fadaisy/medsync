# ADR 0455 — Pharmacy Workspace v2: rollout and redirects

**Status:** Proposed — 27 Oct 2026 (GATE A §3, D-PW-09).

## Decision

1. **Old list pages.** While the flag is on for the viewer's hospital, each old list page answers a temporary redirect (307, `app/pharmacy/_lib/to-v2.ts`) to its new place and tab, carrying the query string. A 308 would be cached by browsers and outlive switching the flag off.
2. **Unchanged routes.** Detail, print and form routes keep their URLs inside the new shell.
3. **Removal comes later.** Deleting the old interface and moving the map to permanent redirects in `next.config.ts` happen only after the CSO signs the parity checklist and a pilot ends.

`tests/pharmacy/workspace-v2/redirects.test.ts` walks the map.
