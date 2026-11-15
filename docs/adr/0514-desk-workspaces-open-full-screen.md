# ADR 0514: Desk workspaces open full screen, with a "More" group for the other admin pages

**Status:** Accepted, 15 Nov 2026. Fadhul sent a tablet screenshot of `/hospital-admin/clinics` on the Tether domain ("is this supposed to look like this?") and chose the "More" group in chat.

## Context

Clinics & schedule (ADR 0501) and the reception desk (ADR 0485, 0500) draw their own full-screen desk shell (`DeskShell`, `height: 100dvh`). Their routes still sat under the old workspace layouts (`HospitalShell`, `ReceptionShell`), so production showed two sidebars and two top bars, and the desk's own top bar was pushed out of view. The signed screens (`docs/clinics-schedule/screens/`) show the workspace alone. The clinic floor (`/clinic`) has no wrapping layout and was right.

## Decision

- The old frames' sidebar and top bar go through `ShellFrame` (`components/medsync/shell-frame.tsx`), which renders the page alone on exact paths: `/hospital-admin/clinics` always, and `/reception` whenever the desk is the reception (on Tether, or behind `RECEPTION_DESK`; the same rule as `app/reception/page.tsx`). It reads the path on the client, because a layout is not drawn again when the person moves between its pages. Scope providers and every other page are unchanged.
- The Clinics & schedule rail ends with a "More" group linking to the other hospital-admin pages from `FEATURE_AREAS` (not the Overview placeholder, not this workspace). The page names are the registry's; the heading and the group's accessible name are new drafts in `content/clinics-schedule/more.ts`.

## Consequences

- Admins reach Staff, Departments & services, Intake, Reports, Admins, Audit and Hospital profile from the workspace; the old frame's ⌘K palette does not open on it (the workspace has its own find).
- On the desk, Lab payments (a separate page, ADR 0485) is reachable only by its address while the desk is the reception.
- The rail scrolls on short screens, so the user dock can sit below the fold.
