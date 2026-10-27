# ADR 0468: Test hospitals see Pharmacy Workspace v2 in production before the copy is signed

**Status:** Accepted, 27 Oct 2026, by the owner (Fadhul). This is a development decision. **It is not a sign-off of the v2 wording.**

## Context

`PHARMACY_WORKSPACE_V2` (ADR 0451–0455) stays off in production while `PHWS2_COPY_STATUS` is draft. `workspaceLiveFor` refuses any flag whose notices are unsigned when `VERCEL_ENV=production`. The lab's v2 used the same rule.

The owner merged Workspace v2 and wants to use it on the production deployment at the test hospitals before the Clinical Safety Officer signs the wording.

## Decision

- At a hospital that `PHARMACY_DEV_HOSPITALS` lists (ADR 0394: a list of ids, or `1` for every hospital), Workspace v2 follows `PHARMACY_WORKSPACE_V2` alone. The unsigned wording does not keep it off there (`pharmacyWorkspaceV2LiveFor` in `lib/pharmacy/feature.ts`).
- Every other hospital is unchanged: v2 stays off in production until the copy is signed.
- One reader, `pharmacyDevHospital` (`lib/pharmacy/access.ts`), parses the list for both this and the permission map, so the two can never disagree.
- Nothing else changes:
  - `PHWS2_COPY_STATUS` stays draft;
  - the CSO items in `docs/pharmacy/workspace-v2/FINAL-REPORT.md` §4 stay open;
  - Step 11 (removing the old interface) still waits for the parity signature and a pilot.

## To see it

In Vercel production, set `PHARMACY_WORKSPACE_V2` to `1` or to the test hospital ids, keep `PHARMACY_DEV_HOSPITALS` naming those hospitals, and deploy.

## Rules

- ADR 0394's rule applies here too: list only test hospitals with fixture patients, never a hospital treating real patients.
- Before any real go-live, unset `PHARMACY_DEV_HOSPITALS` and have the v2 wording signed.
