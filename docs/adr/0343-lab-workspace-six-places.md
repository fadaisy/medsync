# ADR 0343 — Lab Workspace v2: six places, one shell

**Status:** Accepted — 2026-10-19. The owner approved the GATE A recommendations in chat ("go through all gates"). The CSO signatures in `docs/lab/workspace-v2/gate-a-proposal.md` §11 are still open.

## Context

The lab's sidebar had grown to 35 items in five groups. Staff found it bulky (`docs/lab/workspace-v2/step-0/STOP-0-REPORT.md`).

## Decision

- **Six places in a floating rail:** Today, Bench, Send-outs, Quality, Reports and Set-up. Set-up is for `lab.manage` only. Work inside a place is split into pill tabs, which are URL-driven links.
- **Visibility is not decided again.** A tab is shown when one of the nav items it replaces is visible under `visibleFor(perms, flags)` (`lib/lab/places.ts`).
- **The top bar on every screen holds:**
  - the overline;
  - the place title (the page's h1);
  - Scan or search;
  - Live;
  - Needs you;
  - Emergency, inline. It stands down the floating pill through `data-emergency-inline`.
- **Landing:** the lead goes to Today and everyone else to Bench (`landingFor`).
- **Flag:** `LAB_WORKSPACE_V2` (per hospital), off in production while its copy is a draft.

## Consequences

- `app/lab/_components/v2/shell.tsx` and `space.tsx` hold the shell and the space header. `app/lab/_lib/places.ts` (`labV2()`) gives each page its context.
- Old routes redirect (ADR 0349).
