# ADR 0195 — Scoped keyboard shortcuts in the ward builder

**Status:** Proposed — 2026-09-29.

## Context

The ward builder is a drawing tool, and drawing tools are driven from the keyboard. A global listener would
steal keys from the rest of the app and from text fields.

## Decision

1. **Where.** Shortcuts are handled on the editor's root element, never on `window` or `document`.
2. **Text fields keep their keys.** An event whose target is an `input`, `textarea`, `select` or contenteditable
   element is ignored, so a field keeps its own undo.
3. **Undo and redo** (the root): Cmd+Z / Ctrl+Z undoes; Shift+Cmd+Z, Shift+Ctrl+Z and Ctrl+Y redo. The buttons'
   tooltips name the platform's keys. Undo is a reducer over document snapshots: at most 50, per ward in the
   session, cleared on a ward switch; a new edit clears redo; a drag is one step.
4. **On the plan** (when it has focus): R rotates the selection, Delete or Backspace removes it, the arrows nudge
   it one cell, Escape stops placing and clears the selection, Enter places the armed palette item at the
   plan's centre.
5. **Live mode** turns every editing shortcut off.
6. **Never only by mouse.** The Items list (a table of every bed, room, divider and fixture with select, edit,
   position, rotate and delete) gives full keyboard and screen-reader access.

## Consequences

- Shortcuts can't fire from a dialog or another page.
- The key handling is a pure function (`lib/wards/keys.ts`) with its own tests.

## Alternatives considered

- **Global listeners with an "is the editor open" guard:** easy to get wrong, and they fire inside text fields.
