# ADR 0256 — Payment state on the order, and the never-held rule

**Status:** Accepted — 2026-10-12 (owner, also the CSO, on the instruction to pass every gate on the recommendations: [GATE A](../lab/phase-2/gate-a-proposal.md)). Built on `feat/lab-one-menu` behind its flag; migrations 0107–0111 are GATED and owner-applied. No clinical value is set by this decision.

## Decision

1. Each lab order line has a payment state (events, newest wins). An Immediate or emergency order, or one from the resus
   desk, is `emergency` from placement; the database refuses any later payment event for it.
2. Modes per hospital: off, inform (collect with a recorded reason), hold (wait for the cashier). No mode holds an
   emergency.
3. The cashier (the reception cadre) reads a database function that returns identifiers, unrestricted test names and a
   count of restricted ones. No prices in this slice.
