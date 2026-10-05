# ADR 0208 — NCD registry access control: capabilities on the repository's roles, two layers, no bypass

**Status:** Proposed — 2026-10-05. NCDSync build (docs/ncd/PROMPT-NCDSYNC-BUILD-v2.md §8.1, I1). No accepted ADR covers
a registry's access strategy, so the prompt's default is implemented and recorded here for the owner to accept or change.

## Context

The registry holds identifiable records of people with chronic conditions at one facility. The prompt asks for defence in
depth: one server-side authorisation function on every read and write, and row-level policies on every table, with the
application connecting as a role that does not bypass them. The repository already propagates identity for the EMR as
transaction-local GUCs (ADR 0131), but the EMR writer stays the table owner, so its policies bind reads only.

## Decision

1. **Capabilities, not new roles.** 31 capabilities (lib/ncdreg/capabilities.ts) are granted to eight NCD roles.
   Five of the roles are **derived** from what the repository already records: nurse cadres → triage nurse; doctor cadres
   and clinical officer → clinician; the RECEPTION cadre → registry officer; the hospital admin roster → administrator. The
   roles the repository has no equivalent for (registry lead, head of department, auditor, clinical safety officer) are
   **assigned** per facility in `ncd_staff_role`. The administrator may assign the first three; only the database owner may
   assign the clinical safety officer. Superadmin resolves to no NCD role at all; break-glass stays the only path.
2. **The database decides who someone is.** `private.ncd_user_roles(user, hospital)` derives the roles;
   `private.ncd_current_roles()` adds two principals that are not people: `system` (cron) and `demo_loader` (valid only while
   the user who switched demo data on holds `demo_data_manage`, and only for synthetic persons).
3. **Layer 1:** every NCD server path calls `authorize(ctx, …)` (lib/ncdreg/context.ts) before it touches the database.
4. **Layer 2:** every NCD table has RLS enabled and forced, with policies **generated** from one map
   (lib/ncdreg/table-access.ts) into migration 0093. Reads **and writes** run under `medsync_ncd_app` (no BYPASSRLS).
   Dashboards and the indicator engine run under `medsync_ncd_analytics`, which is granted no `*_ciphertext` or `*_hmac`
   column at all. Nothing is granted to `anon` or `authenticated`.
5. **Every NCD table carries `facility_id`** (except the global capability map), and every policy pins it to the
   transaction's hospital, so no cross-facility read is possible for any role.
6. **No human deletes.** Only the demo loader principal deletes, only rows of synthetic persons, and a trigger refuses the
   deletion of any non-synthetic person's row even to the owner.

## Consequences

- The access probe suite (tests/ncdreg-db/access-probes.test.ts) derives every expected allow/deny from the same two maps
  and checks 26 tables × 16 actors × 4 operations against the real policies on the PGlite lane.
- A capability change is a code change plus `npm run ncdreg:policies`; a test fails if the migration's generated block is stale.
- Superadmin cannot read the registry. A support need goes through break-glass, which this module does not widen.
- Owner decisions open: D-10 (the cadre mapping), D-11 (nobody holds clinical safety approval by default), D-15, D-16.
