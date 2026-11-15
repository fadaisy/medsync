# ADR 0505 — Clinician identity on patient surfaces needs consent

**Status:** Accepted — signed by Fadhul (CSO) in chat, 15 Nov 2026, with GATE A (docs/clinics-schedule/gate-a-proposal.md). Built on `feat/clinics-schedule`.

## Context

DPPA 2019: a clinician's name or photo is personal data.

## Decision

Booking cards, tickets and SMS name a clinician or show a photo only when a written-consent record (date, who recorded it) is on the staff record. Otherwise the cadre is shown. A database CHECK enforces it.

## Consequences

New people start hidden. Photos never leave Tether.
