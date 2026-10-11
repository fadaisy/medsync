# ADR 0227 — Pharmacy access: six names, one grant, derived from cadre; the `pharmacy_staff` carrier and the title rule

**Status:** Accepted — 2026-10-10 (owner, also the CSO), Pharmacy Phase 0 GATE A, D-PH0-01 to -03
([gate-a-proposal](../pharmacy/phase-0/gate-a-proposal.md) §2.1–§2.3).

## Context

A pharmacist or pharmacy technician could sign up but had no access to anything pharmacy-specific. The only role value
for them was `pharmacist`, which a technician must never carry: in Uganda a person who is not a pharmacist may not be
described as one, and the registering body for technicians is not yet confirmed from a primary source.

## Decision

1. Six permission names: `pharmacy.view`, `pharmacy.review`, `pharmacy.dispense`, `pharmacy.stock`,
   `pharmacy.controlled`, `pharmacy.manage`. **Only `pharmacy.view` is granted** in Phase 0; the other five are
   reserved, granted by the phase that uses them after the legal reading of who may do each.
2. Permissions derive on every request from the approved cadre through a signed map,
   `data/pharmacy/permission-map.v1.json` (v1.0.0: Pharmacist and Pharmacy technician → `pharmacy.view`), built on the
   workspace-neutral `lib/workspace-access/access.ts` (ADR 0229). An unsigned map grants nothing.
3. The carrier for landing and MFA is a new role value, **`pharmacy_staff`** (migration 0098). The old `pharmacist`
   value stays in the CHECK, unused.
4. **Title rule:** no screen, export or audit line shows a role value. The top bar and every audit basis carry the
   approved cadre's own name ("Pharmacy technician"); a source scan holds it.

## Consequences

- A technician is never labelled a pharmacist anywhere, and granting more later is a map change.
- Doctors, nurses, lab, reception and admins hold no pharmacy permission; their prescription reads are unchanged.
- The technician's registering body is still to be confirmed (Appendix C); view-only access carries no supply authority.

## Alternatives considered

Reusing `pharmacist` as the carrier for both cadres (the title problem); a permissions table (nothing to store while
the map answers the question).
