# ADR 0215 — NCD registry: a superadmin holds only roles assigned explicitly

**Status:** Proposed — 2026-10-06. Amends ADR 0209 (access control) on one point; migration `0094` (GATED).

## Context

ADR 0209 made a superadmin resolve to no NCD role at any hospital, whatever was assigned, so that platform
operation never opens the registry's identifiers. The owner, who is both the platform superadmin and the Clinical
Safety Officer for the evaluation site, needs to use the registry with that account.

## Decision

A superadmin holds the NCD roles assigned to them explicitly in `ncd_staff_role` at that hospital, and nothing
else. Roles derived from cadres (staff affiliations) and from the hospital-admin roster still do not apply to a
superadmin. `private.ncd_user_roles` is changed in migration `0094_ncd_superadmin_explicit_roles.sql`.

The first assignment can only come from the database owner (Supabase SQL editor): the application refuses to
assign a role to someone who holds none there, and refuses the CSO role altogether.

## Consequences

- Platform access alone still opens nothing; registry access for a superadmin is a deliberate, per-hospital,
  revocable row with `granted_by` and `granted_at`, and every read is still logged in `ncd_access_event`.
- A superadmin with an explicit role is subject to the same capabilities, policies and four-eyes rules as anyone
  holding that role.
- Tests: `tests/ncdreg-db/interlocks.test.ts` (0094: explicit only, per hospital, revocable; the administrator
  cannot assign a superadmin), `tests/ncdreg-review/attacks.test.ts` (no assignment, no role), the access probes
  (a superadmin on staff with no live assignment holds nothing).
