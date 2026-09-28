# ADR 0161 — Pop-ups are centred landscape dialogs, never side sheets

**Status:** Accepted — 2026-09-26. Owner decision. It supersedes the "slide-out panel API" in `docs/hospital-admin-integration-contract.md` §5.

## Context

The Departments & services hub opened its panels as a sheet sliding in from the right. The owner asked for it to go: pop-ups in MedSync are the centred, landscape card that the scheduling console and the doctor and clinician schedules already use (`components/medsync/editor-dialog.tsx`). The owner also asked for this to be a rule.

## Decision

1. **Every pop-up is a centred landscape card:** `EditorDialog`. This covers detail panels, editors, catalogues and forms that open over a page.
   - It has a header, a body that scrolls (at most 88 % of the screen height) and a footer. ✕, Esc and the backdrop close it.
   - `wide` (5xl) seats sections side by side. `medium` (3xl) is for short forms.
   - On a phone the same card fills the width. There is no second pattern.
2. **Nothing slides in from an edge,** so there are no side sheets or drawers for content.
   - The one exception is the phone navigation menu, which is navigation and not a pop-up.
   - The ⌘K palette is already a centred dialog.
3. **The hub goes first.** `HubPanel` is built on `EditorDialog`. The department, clinic and ward panels use `PanelColumns`: settings on the left, related lists and history on the right.
4. **The side sheets that remain move to the card when they are next touched.** New code never adds one. As of this ADR they are:
   - Staff's two detail sheets;
   - the superadmin console's approvals, tenants, people, audit and create-hospital sheets;
   - the doctor workspace's panel and triage sheets;
   - `components/responsive/responsive-sheet.tsx`.

   The resus desk already opens its sheets centred.

## Consequences

- A panel shows more at once, and the page behind stays in place, centred under it.
- `components/ui/sheet.tsx` stays, because the dialog uses its header, body and footer pieces and the phone navigation uses the sheet itself. New content must not use `SheetContent`.
- Motion is the dialog's own: fade and a slight scale, 100 ms, with reduced motion honoured.
