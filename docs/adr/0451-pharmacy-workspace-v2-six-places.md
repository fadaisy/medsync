# ADR 0451 — Pharmacy Workspace v2: six places and one shell

**Status:** Proposed — 27 Oct 2026. The owner approved building it ("go through all gates"). The CSO signature on the copy is pending (GATE A §11).

## Context

The pharmacy grew to 24 nav items across four phases, each behind its own flag. The canvas `pharmacy-workspace-v2-canvas` reorganises it the way Lab Workspace v2 did ([ADR 0343](0343-lab-workspace-six-places.md)).

## Decision

1. **Places.** There are six: Today, Window, Shelf, Store, Clinical and Set-up, plus the Needs you inbox, in one Tide shell (`app/pharmacy/_components/v2/shell.tsx`, `data-ds="tide"`, place hue grape).
2. **Tabs follow the nav.** A tab exists exactly when the old nav item it replaces is visible (`lib/pharmacy/workspace-v2/places.ts` reads `pharmacyNavFor`), so flags and permissions are unchanged.
3. **Interface only.** Tabs render the old pages' own bodies. New code is read-only.
4. **Behind a flag.** `PHARMACY_WORKSPACE_V2` gates v2 per hospital. In production it stays off while `PHWS2_COPY_STATUS` is draft.

## Consequences

The old shell stays for hospitals without the flag. Removing it is a later step that waits for the parity signature and a pilot ([ADR 0455](0455-pharmacy-workspace-v2-rollout-and-redirects.md)).
