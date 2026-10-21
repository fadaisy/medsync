# ADR 0361 — Tide by re-pinning tokens, switched by `TIDE_SURFACES`

**Status:** Accepted — 2026-10-21 (D-TW-10, D-TW-14, D-TW-15). Temporary: Step 10 deletes the flag, the scope and Chroma's values.

## Decision

- A surface group turns Tide when its layout renders `<TideScope group>` (`components/medsync/tide-scope.tsx`), which adds `data-ds="tide"`.
- `app/globals.css` then re-pins the existing token names to Tide values on `:root:has([data-ds="tide"])`. That block is the lab's own re-pin (ADR 0344), plus Tide's face, its radii and Tide Navy for dark. Every existing component renders in Tide with no edit and no behaviour change.
- The shared `SIDEBAR_CLASS` (`medsync-rail`) and the glass top bar give every staff shell the floating rail and the top bar on the ground, in one rule.
- `TIDE_SURFACES` is an env flag: `1` for all groups, or a comma-separated list of group names (`lib/design/tide.ts`). Unset, nothing changes.
- Parity is checked with the CDP harness and axe-core, not Playwright (no new dependency).
- The resus desk renders forced light (`TideScope light`, D-TW-07). Because `:has` reaches the whole document, resus turns Tide with the doctor and nurse groups.
