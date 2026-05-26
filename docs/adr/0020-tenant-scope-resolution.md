# ADR 0020 — Hospital-admin tenant scope is resolved by a helper, not by URL

**Status:** Accepted (2026-05-26)
**Context:** Hospital-admin workspace SHELL/OVERLAY kickoff §1, §3. Follows ADR 0019.

## Problem

The hospital-admin workspace is strictly single-tenant. Every feature in the workspace will need "the current admin's hospital id" for at least one query. There are two shapes of solution:

1. **URL-derived scope.** Route as `/hospital-admin/[hospitalSlug]/...`; features read `params.hospitalSlug` and resolve to an id. Familiar from Linear, Notion, Stripe.
2. **Helper-derived scope.** Route as `/hospital-admin/...` (no scope segment); features call a single accessor — `requireHospitalAdminScope()` — that resolves from the authenticated admin's affiliation.

## Decision

Use the **helper-derived** approach.

- Server: `lib/hospital-admin/scope.ts` exports `requireHospitalAdminScope()`. It validates auth + AAL2, resolves the admin's hospital from `user_roles` + `hospital_admin_roster`, refuses non-reachable lifecycle states, and either returns the typed scope or `redirect()`s.
- Client: `<HospitalScopeProvider>` (set by the shell) makes the same scope available via `useHospitalScope()`. Client features never receive `hospitalId` as a prop and never derive it from the URL.
- Edge Functions: `supabase/functions/_shared/hospital-admin-scope.ts` exports `requireHospitalAdminScope(callerId, hospitalId)` which re-pins the role check and refuses suspended / offboarded tenants — the same shape, server-side again.

## Why not URL-derived?

The URL form is more idiomatic for products with multi-tenant operators (Linear, Stripe). MedSync is the opposite case:

- **Most hospital admins hold exactly one role.** Putting their hospital in the URL adds a segment that never varies.
- **A URL-derived scope is an attack surface.** Every feature has to remember "validate the URL param against my own role". One forgotten check is a tenant breach. With a helper, there's no parameter to validate — the resolver IS the validation.
- **Bookmarks and copy-paste behave better.** `/hospital-admin/staff` always means "your hospital's staff" regardless of session. The user can't accidentally share a URL containing a slug for a hospital they're no longer admin of.
- **Future multi-hospital admins get a workspace switcher**, not a URL slot. The switcher updates the resolved scope (and bounces the user to the same logical route under the new tenant). The helper makes this a one-place change.

## What we lose

- A workspace-switcher would have to manipulate cookies / server state instead of just changing the URL.
- Deep links between hospitals (for the rare multi-hospital admin) need to encode the target tenant in a query param the switcher reads, instead of riding the URL.

Both are small costs paid by a small (today: zero) population.

## Consequences

- **Every** Server Component, Server Action, route handler, and Edge Function inside `/hospital-admin` calls the helper. The kickoff makes this load-bearing: features that re-derive scope from elsewhere are bugs and the linter (next iteration) should flag them.
- The helper is the single point of audit: when "tenant isolation" tests run, they test the helper. When a new lifecycle state is added (e.g. `agreement_expired`), the reachable-states allow-list in the helper changes once.
- Server-side guarantees + RLS at the database mean the helper is **belt-and-suspenders**: even if some future bug widens the JS scope, RLS still refuses the wire. The test in `tests/hospital-admin/tenant-isolation.test.ts` proves this.
