# ADR 0221 — Lab access: six permissions by cadre and headship, carried by the lab role

**Status:** Accepted — 2026-10-10 (owner, also the CSO), Lab Phase 0 GATE A, D-LAB0-01 and D-LAB0-02
([gate-a-proposal](../lab/phase-0/gate-a-proposal.md) §2).

## Context

Lab access was one role, `lab_tech`, granted only by hand through `assign-role`, and the EMR checked a cadre list.
A hospital could not narrow who releases results, and approving a laboratory technician gave them nothing.

## Decision

1. Six permissions: `lab.view`, `lab.collect`, `lab.receive`, `lab.result.enter`, `lab.result.release`, `lab.manage`.
   They are **derived on every request, never stored** (`lib/lab/access.ts`).
2. Bench permissions come from the approved lab cadre through a signed, versioned map,
   `data/lab/permission-map.v1.json` (v1.0.0): technicians and technologists hold every bench permission. A cadre not
   in the map holds none; an unsigned map grants nothing.
3. `lab.manage` comes only from an open `department_heads` row: head of LABORATORY for the whole lab, head of a lab
   section for that section. Never from a cadre.
4. `lab_tech` in `user_roles` stays the carrier for landing and the MFA rule (ADR 0222 keeps it in step).
5. Checks: `lab.view` in `requireLabTechScope()` (the not-authorised page when absent, where LAB_WORKSPACE is on);
   receive, reject, enter and release check their permission in the EMR write path when the actor came through the
   lab scope (`requireLabPermission`).

## Consequences

- Narrowing release later is a map change, not a code change.
- Doctors, nurses, reception and admins hold no lab permission; nurses and doctors keep collecting as before.
- The legacy (`LAB_RESULTS_LIVE`) entry path keeps its cadre check; Lab Phase 1 retires it.

## Alternatives considered

Four separate roles (more rows to keep in step, and a hospital still could not narrow one act); a permissions table
(nothing to store while the map and headship answer the question).
