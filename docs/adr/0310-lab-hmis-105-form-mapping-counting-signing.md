# ADR 0310 — HMIS 105: the form version as data, the mapping, the counting rules, designations, signing and revisions

**Status:** Accepted — 2026-10-13 (owner, also the CSO, on the instruction to pass every gate on the recommendations: [GATE A](../lab/phase-3/gate-a-proposal.md)). Built on `feat/lab-quality-registers` behind its flag; migrations 0112–0118 are GATED and owner-applied. No clinical value is set by this decision.

## Context

Each month the laboratory hand-tallies HMIS 105 section 10 (and the tracer rows of Section 6) and the Health Unit
In-Charge signs it. The printed form and the eHMIS dataset could not be obtained in this session (OA-1, OA-2).

## Decision

1. **The form is a committed data file** (`data/lab/hmis105-2019-09.json`, E-LAB3-05): 134 rows from the research
   transcription, every row `verified: false`, positive columns unknown, eHMIS ids null; its SHA-256 pins every
   mapping. It is national, so it is not per hospital.
2. **The mapping** (`hmis_mapping`, key = the form version) maps each row to tests or components, positive answers,
   visits, specimen columns, rejection codes, availability reasons, HIV tests, kits, purposes and tracer items. It is
   signed by the laboratory lead and **co-signed by the HMIS focal person** (E-LAB3-12), and cannot be signed while
   the form is unverified, a row is unknown, or an orderable in-house test is in no row and not excluded (HM-2).
3. **Counting rules** HM-3 (a)–(i) live in the engine (`count105`) and in the signed copy: hospital-local result
   month, downtime by the form's time; chemistry per analyte; QC and EQA never in 10.2; rejected specimens in 10.7
   only; referred-out in 10.5 by reason; outside results never; an amended result once, as its current version;
   bedside in its row with the share shown; blank off the menu, 0 on the menu.
4. **Designations** (`hmis_designations`, E-LAB3-11): the hospital admin designates the In-Charge and the HMIS focal
   person, time-bound. No new role.
5. **Lifecycle** (`lab_hmis_reports`): draft → checked (lead) → signed (In-Charge, fresh second factor; the checker
   does not also sign while another In-Charge exists) → exported. A signed report is frozen by trigger and never
   deleted. "Changed since signing" is computed on every view (and nightly by `/api/cron/hmis-changes`), names the
   cells old and new and the records behind them, and needs a revision (HM-11).
6. **Print and CSV only** (D-LAB3-23): the CSV follows the form's order, blanks absent and zeros present; cells
   without eHMIS ids are listed as comment lines, never invented (HM-12).
7. **The HIV testing purpose** is required on HIV rapid-test orders when `labHmis` is on, restricted with the test
   (D-LAB3-21); the availability snapshot gains the hub's reason for 10.5.
8. Behind `labHmis`: `/lab/hmis`, `/lab/hmis/mapping`, `/lab/hmis/records`, `/lab/hmis/print` and the `/hmis` desk.

## Consequences

Nothing is signable until the owner verifies the rows (OA-1); the CSV has no data rows until the eHMIS ids exist
(OA-2). The paper tally stops only after the parallel month (S45).
