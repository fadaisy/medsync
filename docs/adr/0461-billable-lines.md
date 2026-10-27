# ADR 0461 — Billable lines: the contract with Accounts

**Status:** Accepted — 27 Oct 2026 (catalogue slice Step 8, under GATE A). Reads 0257's supply columns.

## Context

The Accounts dashboard and the patient's phone bill (later slices) need what is owed for a prescription. MedSync
holds no money (Law 14), and taking payment needs a licensed provider.

## Decision

`billableLines(tx, hospitalId, prescriptionIds)` returns one row per supply of those prescriptions that stands
(a reversed supply is not owed): supply, prescription, product, quantity in issue units, payer, `kind` (`priced`,
`free` or `price_not_set`), `unitPrice` (the snapshot at supply, null unless priced), and `lineTotal`. It returns
the total of the priced lines and a `version`, a hash of the lines, which changes whenever a line does (S30). A
price change never moves a bill: the price is the supply's snapshot. A supply from before 0257 carries no kind: a
snapshot above 0 reads as priced, none as `price_not_set`, never 0. It writes nothing.

Readable by pharmacy staff now (RLS: `pharmacy.view`). The accounts role and the patient (own bill only) are a
later grant. The existing payment field (`setPaymentStatus`) stays the only source of "Paid".

## Consequences

- A correction that changes no supply field leaves the version alone; a reversal or a new supply changes it.
- Out of this slice: taking payment, claims, taxes, the phone bill.
