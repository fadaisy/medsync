# ADR 0502 — Draft, publish, schedule and restore

**Status:** Accepted — signed by Fadhul (CSO) in chat, 15 Nov 2026, with GATE A (docs/clinics-schedule/gate-a-proposal.md). Built on `feat/clinics-schedule`.

## Context

Patients, desks, screens and SMS must never see a half-made change (CS3), and admins need undo and history.

## Decision

An edit is a draft change: row edits with before and after, one shared list per hospital. The workspace shows published records with drafts applied; the engine tables stay the published version. Undo drops a change and every change after it. Publish re-validates and calls cs_publish, which applies every edit in one transaction and numbers a version. Pause is immediate; resume goes through publish. A scheduled publish re-validates when it runs and, if invalid, does not publish and tells the author. Restore creates one draft back to that version.

## Consequences

No reader changes: the engine tables already are the read model. Booked sessions touched by a publish go through the engine's cancel and reschedule flows after commit, never edited here.
