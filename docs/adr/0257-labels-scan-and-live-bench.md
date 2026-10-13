# ADR 0257 — Labels, identity at collection, scan to receive and the hospital's live lab channel

**Status:** Accepted — 2026-10-12 (owner, also the CSO, on the instruction to pass every gate on the recommendations: [GATE A](../lab/phase-2/gate-a-proposal.md)). Built on `feat/lab-one-menu` behind its flag; migrations 0107–0111 are GATED and owner-applied. No clinical value is set by this decision.

## Decision

1. A label number is issued per order at placement (`lab_labels`) and can be voided once ("Void and print new").
2. With the check on, a specimen is marked collected only after a matching label check in the same transaction. Every
   check is recorded, mismatches included. There is no override.
3. A keyboard-wedge scan receives in one action, scoped to the hospital (another hospital's label is not found); a
   second scan says when and by whom; undo within five minutes; a high-risk specimen needs "Procedure followed".
4. `lab:<hospital>` carries ids and event names only, for that hospital's lab staff; the worklist polls every 15 seconds
   when the channel is down, and says so.
