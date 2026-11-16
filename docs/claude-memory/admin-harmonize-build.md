---
name: admin-harmonize-build
description: 16 Nov 2026 — one admin workspace (ADR 0516) phase 1 built on claude/funny-shannon-i7xgwp; phase 2 open
metadata:
  type: project
---

Phase 1 of "one admin workspace" (ADR 0516), built 16 Nov 2026 on `claude/funny-shannon-i7xgwp` from main c40ede0f, from the owner's approved prototype (canvas https://claude.ai/artifact/HarTXgkAUCwG4rcDSRV5r3, on top of the Tether Clinics & Schedule canvas DsGesqF3pfLyE4nkWJj7i4). Read `docs/hospital-admin/harmonize/REPORT.md`.

- Every /hospital-admin page is in the desk shell (`components/hospital-admin/admin-frame.tsx`); one menu in `lib/hospital-admin/admin-nav.ts`, drawn by the frame and the Clinics & schedule rail (`AdminNavGroups`). Intake off the menu on Tether only.
- New `/hospital-admin/requests` (Pending moved from Reports; records-requests 308s there). Mark sent needs a note ≥ 8 chars; no migration (the request row is the record).
- Fixed: non-clinical staff in the directory; ⌘K clinic link; `.su-f > .in` collapse.
- Owner decisions (standing "use all your recommendations"): Intake off Tether now, deleted when the desk covers six arrival types; Remind yes, Hand over no; wards and set-up stay on MedSync with a Tether summary.

**Why:** the owner asked to build the harmonized prototype with minimal usage.
**How to apply:** phase 2 = Today, People tabs, one Emergency page, Activity, Remind EF, Tether summaries, old pages in desk components. Wording draft in `content/hospital-admin/admin-nav.ts`. Related: [[clinics-schedule-build]], [[tether-main-chat-handout]].

## Phase 2 (16 Nov 2026, ADR 0517)

Built on the same branch from the owner's "go ahead with the phase 2 build" after prototype v13. Today
(`/hospital-admin/today`, the home), Activity (`sa_audit_log`, allowlisted admin actions only), People (was Staff),
Departments, Emergency and support (change dialog per stored type; Leaflet pin writes the one coordinate pair, one
admin), Wards and beds (cards; builder publishing bar), Laboratory and imaging (`/hospital-admin/lab`, hub surface of
the test-menu actions), Hospital profile and Reports. Remind deferred on the owner's ruling (needs a staff dispatch
kind, a GATED migration). Not stored, so not built: divert ambulances, "confirm still true", extra pins, courier days,
imaging room/slot/portable, single-test show switch, admin swap, invitation resend. No migration in phase 2.
