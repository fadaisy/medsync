# ADR 0416 — The patient web shell: the rail at desktop width, the phone's pill at phone width

**Status:** Accepted — 2026-10-25 (GATE A, docs/patient-web/gate-a-proposal.md; signed by Fadhul, CSO, in chat: "do what's recommended").

## Decision

- `PatientShell` (`components/tide/shell.tsx`): at ≥ 761 px a floating left rail 96 px wide with Home, Visits, the plus, Care and Me, each with its word, and the home facility at the foot; at ≤ 760 px the phone's floating bottom pill, unchanged (D-PW-02).
- Help is never in the rail or the pill: it is the red pill in every header, labelled "Help, emergency" (L6). It stands the floating Emergency pill down with `data-emergency-inline`.
- Care's badge counts doses due now, in ink, never red. The bell is lagoon and rings every 4 s while anything is unseen (reduced motion: still).
- Main buttons are navy (`--pw-act`, D-PW-01); lagoon is for now, the plus and the unseen bell. DESIGN-medsync.md's patient-web column follows.

## Consequences

This replaces DESIGN-medsync.md's "top bar: mark, back, Help" for patient web navigation.
