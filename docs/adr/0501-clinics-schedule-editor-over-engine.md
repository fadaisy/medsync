# ADR 0501 — Clinics and schedule is an editor over the booking engine

**Status:** Accepted — signed by Fadhul (CSO) in chat, 15 Nov 2026, with GATE A (docs/clinics-schedule/gate-a-proposal.md). Built on `feat/clinics-schedule`.

## Context

The canvas shows clinics, sessions, places, holidays, closures, people and devices. Each already has an engine record (service lines, session templates, Hub places, public holidays and closures, staff affiliations, availability, desk devices).

## Decision

The workspace stores none of them again. Missing fields are columns on the existing records (migration 0296). The only new tables are the draft log, versions, scheduled publishes, fee bands and per-hospital holiday decisions. A guard fails on any new table that duplicates an engine record.

## Consequences

One clinic editor: the Hub's Clinics tab and the old Scheduling page point here at cut-over (308s). Session templates gain arrays for rooms and clinicians beside the single columns, which keep the first of each for older readers.
