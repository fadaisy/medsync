# ADR 0452 — Pharmacy Needs you: one inbox over existing sources

**Status:** Proposed — 27 Oct 2026 (GATE A §7).

## Decision

Needs you lists only what someone with the viewer's permissions must decide:

- open controlled differences;
- look-back;
- downtime sheets;
- deliveries being counted;
- requisitions to issue;
- issues to confirm;
- reactions to submit;
- open reconciliations;
- packs not signed.

Each item is read from its existing loader and leaves only when its source changes. The shell's count is the length of the same list. Two board items are left out because no source exists: "queries answered" as its own stage, and "reconciliation not started".
