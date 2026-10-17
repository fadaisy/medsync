# ADR 0314 — Results back: provenance on the report, the reference lab's units and ranges, scans, a second check

**Status:** Accepted — 2026-10-17 (owner, also the CSO, signing Lab Phase 4 [GATE A](../lab/phase-4/gate-a-proposal.md) as recommended). Built on `feat/lab-connect-outward` behind `labReferral` / `labExchange`; migrations 0150–0153 are GATED and owner-applied.

## Context

Most referred results come back on paper and are typed in. The typed copy must say where it came from, keep what was printed, and still pass this hospital's unit registry and critical limits.

## Decision

1. A returned result files through the shared `writeReportVersion` (`enterReferredResult`) on the original order: performer external, `entry_mode` transcribed or interface, `referral_id` and a provenance record. No parallel result store.
2. Each value's snapshot is in this hospital's unit (the registry converts; an unknown unit blocks release), with the reference lab's printed value, unit and range kept (`printed`) and `range_source = performing_lab`. The flag compares only against their printed range.
3. A scan of their report is required. When a second lab person is on duty they check it; otherwise the result says "Entered by one person" and a next-shift check task opens.
4. An amendment (their corrected report) is a new version on the same referral, still external, provenance carried (fixed and tested at Step 12, S26).

## Consequences

Doctors see a Referred tag and a provenance block with the original report one tap away. ADR 0327 records how critical values from a reference lab are checked.
