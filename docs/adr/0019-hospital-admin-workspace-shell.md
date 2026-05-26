# ADR 0019 — Hospital-admin workspace shell at `/hospital-admin`

**Status:** Accepted (2026-05-26)
**Context:** Hospital-admin workspace SHELL/OVERLAY kickoff. Follows ADR 0018 (superadmin-initiated hospital create) and the hospital-registration upgrade.

## Problem

A hospital admin and a platform superadmin do fundamentally different jobs. The superadmin runs the platform (cross-tenant operator with god-mode and a heavy audit ceiling); the hospital admin runs a single hospital (tenant-scoped operator with no business knowing other tenants exist).

Before this ADR, both roles landed on `/admin`. The layout's sidebar filtered superadmin-only items so hospital admins saw a reduced view, but the chrome — the URL, the "Superadmin console" identity strip, the data fetchers wired into the layout (cross-tenant Approvals queue, hospital + people palette) — was the superadmin's. That's a tenant-isolation accident waiting to happen, and it makes both shells harder to evolve cleanly.

## Decision

The hospital admin gets its own workspace at **`/hospital-admin/*`**, structurally separate from `/admin/*`:

- `proxy.ts` gates `/hospital-admin` with the same auth + AAL2 + MFA-enrolment rules as `/admin`.
- `app/(auth)/sign-in/actions.ts` routes `hospital_admin` users to `/hospital-admin`; superadmins still go to `/admin`. Both states log their `routeReason` for diagnostics.
- `app/admin/layout.tsx` becomes **superadmin-only**: a hospital admin who bookmarks `/admin` is bounced to `/hospital-admin` rather than seeing god-mode chrome stripped of items.
- Both shells reuse the same primitives (`components/ui/sheet.tsx`, the AdminSidebarItem pattern, the CommandPaletteRoot pattern) but each owns its own configuration (nav set, palette entries, top-bar identity).

## Why not keep one `/admin` for both roles?

- **Scope leak risk.** The current `/admin/page.tsx` is the superadmin Approvals queue. Hospital admins landing there see a queue that shows hospital-application rows from every tenant. The data fetcher is server-side, so RLS doesn't save us — the service client runs above RLS.
- **Chrome lies.** "Superadmin console" in the top bar is wrong for a hospital admin and confusing for the user we're asking to take responsibility for one hospital.
- **Future drift.** Every feature added to either workspace has to remember to filter by role. With separate routes, each layout enforces its own boundary at the entry, not at every query.
- **Reuse, not duplication.** The shells share components by import, not by route. The cost of two layouts is `app/hospital-admin/_components/hospital-shell.tsx` — a thin composition of the same parts.

## What stays shared

- `components/ui/sheet.tsx` — slide-out primitive.
- The `AdminSidebarItem` / `HospitalSidebarItem` pattern (separate files; same shape).
- The `CommandPaletteRoot` / `HospitalCommandPalette` pattern (separate files; same primitives).
- Tokens, motion, type scale (`app/globals.css`).
- `lib/auth.ts`, `proxy.ts`, MFA enforcement — role-aware, no fork needed.

## Multi-hospital admins

The `user_roles` schema allows one user to hold `hospital_admin` against multiple hospitals. The shell currently pins to the **most-recently-designated primary** hospital (or first available reachable hospital if no roster entry). A workspace switcher is deliberately out of scope for the shell prompt and will land in its own feature when needed. A multi-hospital admin can only operate on one hospital per session today, which is the safer default.

## Consequences

- Two layouts to maintain. Both wired through the same primitives, so the cost is small. The integration contract (`docs/hospital-admin-integration-contract.md`) keeps the patterns aligned.
- Sign-in users in the wild who previously landed on `/admin` will now go to `/hospital-admin`. Bookmarks bounce. Sentry should flag any spike of `/admin → /` 30x redirects (= a hospital admin caught at the boundary).
- Features that need both shells (a future "switch to superadmin view" debug toggle) get one tasteful link, not a permission ladder inside one shell.
