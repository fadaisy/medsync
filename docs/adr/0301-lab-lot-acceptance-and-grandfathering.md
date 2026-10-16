# ADR 0301 — Lot acceptance before patient use, grandfathering, and the `poct_lots` move

**Status:** Accepted — 2026-10-13 (owner, also the CSO, on the instruction to pass every gate on the recommendations: [GATE A](../lab/phase-3/gate-a-proposal.md)). Built on `feat/lab-quality-registers` behind its flag; migrations 0112–0118 are GATED and owner-applied. No clinical value is set by this decision.

## Context

ISO 15189:2022 6.6.3 and CLSI EP26 ask that a new reagent lot is shown to agree with the lot in use before patient
samples are run on it. Nothing in MedSync checked this, and at go-live the lab already holds lots it has used for
months.

## Decision

1. **A signed acceptance plan per item** (`lab_signed_configs` kind `acceptance_plan`, laboratory lead alone,
   E-LAB3-12): method (lot comparison, QC pass, certificate, or none), triggers, samples and spread, the criterion
   (absolute, percentage, which applies), and whether QC is also needed. No criterion or sample count is a default.
2. **The lot waits** in `in_acceptance` until the plan's evidence is met; `received` and `in_acceptance` lots are
   refused on the server at the bench, the analyser and the bedside (LA-4). Accept and Reject are append-only rows in
   `lab_lot_acceptances` with the comparison pairs; a rejected lot opens a nonconformity. A lot of an item with no
   signed plan waits and says so (Law 8).
3. **Comparison samples** are shown as "Sample n · level", never with patient identity (LA-5). They are stored as
   sample references, not result ids: the slice has no result search to pick them.
4. **Grandfathering** (LA-6): lots on hand at switch-on are recorded `accepted` with basis "before MedSync" and the
   lead's written statement. QC still runs on them.
5. **The `poct_lots` move** (E-LAB3-02): 0112 copies every bedside lot into `lab_stock_lots` keeping its id (basis
   "before MedSync", in use on its device), repoints `diagnostic_reports.lot_id` to the ledger, and refuses to finish
   unless the counts match. `poct_lots` stays read-only for the reverse path.

## Consequences

A bad grandfathered lot is caught only by QC (hazard 11). Certificates are a reference text, not an upload: the lab
has no storage bucket yet.
