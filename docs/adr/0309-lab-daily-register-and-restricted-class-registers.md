# ADR 0309 — The daily register as a configured read model; restricted-class registers

**Status:** Accepted — 2026-10-13 (owner, also the CSO, on the instruction to pass every gate on the recommendations: [GATE A](../lab/phase-3/gate-a-proposal.md)). Built on `feat/lab-quality-registers` behind its flag; migrations 0112–0118 are GATED and owner-applied. No clinical value is set by this decision.

## Context

The laboratory keeps paper registers per section, and HIV results are kept on their own register. MedSync holds the
same facts, so the register can be printed from the records instead of copied by hand.

## Decision

1. **A read model, not a table**: `/lab/register` reads the day's received, released and rejected lines per section,
   in lab-number order, hospital-local (DR-1). One line per specimen and test; a later amendment is its own line on its
   day, marked Amended; a back-entered downtime result sits on the form's day, marked "entered {date}".
2. **Columns are configuration** (`register_config`, laboratory lead alone): the canvas's defaults until the paper
   registers are photographed (OA-3, D-LAB3-24).
3. **Restricted classes never print on the general register** (DR-3). HIV, TB, mental health and sexual and
   reproductive health have their own registers, offered only to holders of `lab.result.release` ("users with HIV
   access", GATE A §4).
4. **Every print is logged** first (`lab_register_prints`, append-only, with the pages printed), then the print dialog
   opens (DR-4). A4 landscape, black on white, 12 px, 1 px rules, two identifiers.
5. Behind `labHmis` (`LAB_HMIS`).

## Consequences

Paper left on a bench is a procedure risk, not a software one. Rows per page in the print log is an estimate.
