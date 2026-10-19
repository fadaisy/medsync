# ADR 0348 — The lab field kit and its enforcement

**Status:** Accepted — 2026-10-19 (D-UI-10).

## Decision

**Components.** Every lab form uses the field kit (`app/lab/_components/v2/fields.tsx`, `button.tsx`, `kit.tsx`):

- **`DateTimeField` and `DateField`.** Days in words, a typed 24-hour time, quick picks and a month calendar.
  - The server's time is the reference.
  - The value strings are those the native inputs produced, so actions are unchanged.
  - Paper-form times never default.
- **`PickField`.** Chips for four or fewer options, otherwise a combobox by name with a secondary line. Concept ids are never shown or typed.
- **`NumberStepper`.**
- **`LabButton`.** It has no `disabled` prop: a reason disables it and is printed beside it.
- **`EmptyState`.** No dashed boxes.
- **Figures** are in the text face. **"No data"**, **0** and **"Not set"** look different.

**Enforcement.** `tests/lab/workspace-v2/sweep.test.ts` fails the build on any of these under `app/lab`:

- a native date input;
- a visible concept id;
- a `disabled` shared `Button`;
- `border-dashed`.
