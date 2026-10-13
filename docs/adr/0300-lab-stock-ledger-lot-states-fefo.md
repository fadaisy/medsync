# ADR 0300 — The lab stock ledger, lot states and first expiry, first out

**Status:** Accepted — 2026-10-13 (owner, also the CSO, on the instruction to pass every gate on the recommendations: [GATE A](../lab/phase-3/gate-a-proposal.md)). Built on `feat/lab-quality-registers` behind its flag; migrations 0112–0118 are GATED and owner-applied. No clinical value is set by this decision.

## Context

The laboratory had no stock record (STOP 0, H5): the only lots were the bedside `poct_lots`, append-only and without
a state. HMIS 105 Section 6 asks for consumption, days out of stock, stock on hand and expired quantities of tracer
items, and a lot that expired or failed its controls must not reach a patient.

## Decision

1. **An append-only ledger** (`0112_lab_stock.sql`): `lab_stock_items` (kind, unit of issue, tests per unit, linked
   tests and components, HMIS tracer code, levels in months of stock), `lab_stock_lots` and
   `lab_stock_transactions`. On hand is the sum of the ledger per item, lot and hospital (ST-3); nothing stores a
   balance. Receipts (`lab_deliveries`, lines as JSON), counts (`lab_stock_counts`) and adjustments point back at the
   transactions they wrote. Tables are prefixed `lab_` so the pharmacy ledger (Pharmacy Phase 1) stays separate.
2. **Lot states** move only along GATE A §5.1 (received → in acceptance → accepted → in use; quarantined, rejected,
   finished), each move with a `lab_stock_lot_events` row written in the same transaction (a trigger refuses a move
   without one). A lot is never deleted; its item and number never change. "Expired" is the clock's verdict at the end
   of the hospital-local day, not a stored state.
3. **First expiry, first out** (ST-6): the earliest-expiring usable lot is offered first ("Use first", a neutral cue);
   issuing another lot needs a reason, recorded as `fefo_reason`.
4. **Levels are operational**: minimum and maximum months of stock per item, average monthly use from issues over the
   look-back (three months, D-LAB3-09, until the lead sets another), "Not enough history" instead of a number (ST-4),
   a weekly count with a reason for every discrepancy (ST-10), expected-versus-issued listed but never blocking (ST-9).
5. Behind `labStock` (`LAB_STOCK`), `/lab/stock`, `/lab/stock/receive` and `/lab/stock/order`.

## Consequences

Section 6 is counted from the ledger (HM-9). Issues not recorded at the bench make consumption look low; the count
corrects on hand, not history. Pharmacy and laboratory stock are never merged.
